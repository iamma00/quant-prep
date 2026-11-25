//! Content storage: embedded seed, installed bundle, staging, atomic swap and rollback.
//!
//! Layout under the app data directory:
//!
//! ```text
//! content/current/seed.json    the bundle the app serves
//! content/previous/seed.json   the last good bundle (rollback target)
//! content/staging/seed.json    a verified download waiting to be swapped in
//! meta.json                    versions, ETag, history
//! settings.json                user preferences
//! ```
//!
//! A bundle is a single JSON document. Everything the reader needs — chapters,
//! structured data, diagrams — is inside it, so a bundle can be copied, hashed
//! and verified as one unit. No remote path is ever used as a local filename.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// Embedded at compile time: guarantees a useful first run with no network.
pub const EMBEDDED_SEED: &str = include_str!("../resources/seed.json");

/// Hard ceiling for a content bundle (24 MiB). The current bundle is ~0.5 MiB.
pub const MAX_BUNDLE_BYTES: u64 = 24 * 1024 * 1024;
const MAX_CHAPTERS: usize = 1_000;
const MAX_PARTS: usize = 100;
const MAX_DIAGRAMS: usize = 40;
const MAX_DIAGRAM_BYTES: usize = 4 * 1024 * 1024;
const MAX_SEARCH_BLOCKS: usize = 8_000;

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn lock<T>(value: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    value.read().unwrap_or_else(|e| e.into_inner())
}

fn lock_mut<T>(value: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    value.write().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

fn numeric_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split(['.', '-', '+'])
        .take(3)
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

/// True when `a` is greater than or equal to `b` using a tolerant semver compare.
pub fn version_ge(a: &str, b: &str) -> bool {
    let mut a_parts = numeric_parts(a);
    let mut b_parts = numeric_parts(b);
    a_parts.resize(3, 0);
    b_parts.resize(3, 0);
    a_parts >= b_parts
}

pub fn version_gt(a: &str, b: &str) -> bool {
    version_ge(a, b) && numeric_parts(a) != numeric_parts(b)
}

pub fn is_version_like(value: &str) -> bool {
    let trimmed = value.trim().trim_start_matches('v');
    !trimmed.is_empty()
        && trimmed.len() <= 32
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
        && trimmed.chars().next().is_some_and(|c| c.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// Bundle validation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct BundleInfo {
    pub version: String,
    pub app_min_version: String,
    pub parts: usize,
    pub chapters: usize,
    pub diagrams: usize,
    pub bytes: u64,
    pub sha256: String,
    pub generated_at: Option<String>,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Validate a bundle before it is allowed to replace anything.
///
/// This is deliberately structural rather than a full schema validator: it
/// rejects documents that cannot be rendered, while leaving room to add fields
/// in future content versions without breaking old apps.
pub fn validate_bundle(bytes: &[u8], app_version: &str) -> Result<BundleInfo, String> {
    if bytes.len() < 2 {
        return Err("The content bundle is empty.".into());
    }
    if bytes.len() as u64 > MAX_BUNDLE_BYTES {
        return Err(format!(
            "The content bundle is larger than the {} MB safety limit.",
            MAX_BUNDLE_BYTES / 1024 / 1024
        ));
    }
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| format!("The content bundle is not valid JSON: {e}"))?;
    let obj = value
        .as_object()
        .ok_or_else(|| "The content bundle must be a JSON object.".to_string())?;

    let schema = obj
        .get("schema_version")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "The bundle has no schema_version.".to_string())?;
    if schema != 1 {
        return Err(format!(
            "This content uses schema {schema}; this app supports schema 1. Update the app."
        ));
    }

    let version = obj
        .get("content_version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "The bundle has no content_version.".to_string())?;
    if !is_version_like(version) {
        return Err("The bundle's content_version is not a valid version string.".into());
    }

    let min_app = obj
        .get("app_min_version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0");
    if !version_ge(app_version, min_app) {
        return Err(format!(
            "This content needs app version {min_app} or newer. You have {app_version}. Update the app from GitHub Releases."
        ));
    }

    let parts = obj
        .get("parts")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "The bundle has no parts array.".to_string())?;
    if parts.is_empty() || parts.len() > MAX_PARTS {
        return Err(format!("The bundle must contain 1–{MAX_PARTS} parts."));
    }

    let mut chapter_ids = std::collections::HashSet::new();
    let mut chapter_count = 0usize;
    let mut markdown_bytes = 0usize;
    for (pi, part) in parts.iter().enumerate() {
        let part = part
            .as_object()
            .ok_or_else(|| format!("Part {pi} is not an object."))?;
        for field in ["id", "title"] {
            if part.get(field).and_then(|v| v.as_str()).is_none_or(|s| s.trim().is_empty()) {
                return Err(format!("Part {pi} is missing {field}."));
            }
        }
        let chapters = part
            .get("chapters")
            .and_then(|v| v.as_array())
            .ok_or_else(|| format!("Part {pi} has no chapters array."))?;
        for chapter in chapters {
            let chapter = chapter
                .as_object()
                .ok_or_else(|| format!("A chapter in part {pi} is not an object."))?;
            let id = chapter
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| format!("A chapter in part {pi} is missing id."))?;
            if !chapter_ids.insert(id.to_string()) {
                return Err(format!("Duplicate chapter id: {id}"));
            }
            if chapter.get("title").and_then(|v| v.as_str()).is_none_or(|s| s.trim().is_empty()) {
                return Err(format!("Chapter {id} is missing a title."));
            }
            let markdown = chapter
                .get("markdown")
                .and_then(|v| v.as_str())
                .ok_or_else(|| format!("Chapter {id} is missing markdown."))?;
            markdown_bytes += markdown.len();
            chapter_count += 1;
        }
    }
    if chapter_count == 0 || chapter_count > MAX_CHAPTERS {
        return Err(format!("The bundle must contain 1–{MAX_CHAPTERS} chapters."));
    }
    if markdown_bytes > 16 * 1024 * 1024 {
        return Err("The bundle's text is larger than the 16 MB safety limit.".into());
    }

    if obj.get("levels").and_then(|v| v.as_array()).is_none() {
        return Err("The bundle has no levels array.".into());
    }
    if obj.get("tracks").and_then(|v| v.as_array()).is_none() {
        return Err("The bundle has no tracks array.".into());
    }

    let diagrams = obj
        .get("diagrams")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    if diagrams > MAX_DIAGRAMS {
        return Err(format!("The bundle has more than {MAX_DIAGRAMS} diagrams."));
    }
    if let Some(map) = obj.get("diagrams").and_then(|v| v.as_object()) {
        for (name, svg) in map {
            let svg = svg
                .as_str()
                .ok_or_else(|| format!("Diagram {name} is not a string."))?;
            if svg.len() > MAX_DIAGRAM_BYTES {
                return Err(format!("Diagram {name} is too large."));
            }
            if !svg.trim_start().starts_with("<svg") {
                return Err(format!("Diagram {name} is not an SVG document."));
            }
        }
    }

    if let Some(search) = obj.get("search").and_then(|v| v.as_array()) {
        if search.len() > MAX_SEARCH_BLOCKS {
            return Err(format!("The search index has more than {MAX_SEARCH_BLOCKS} blocks."));
        }
    }

    Ok(BundleInfo {
        version: version.to_string(),
        app_min_version: min_app.to_string(),
        parts: parts.len(),
        chapters: chapter_count,
        diagrams,
        bytes: bytes.len() as u64,
        sha256: sha256_hex(bytes),
        generated_at: obj
            .get("generated_at")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

// ---------------------------------------------------------------------------
// Meta and snapshots
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentSource {
    Embedded,
    Installed,
    Previous,
    Seed,
    Update,
    Rollback,
}

impl ContentSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Embedded => "embedded",
            Self::Installed => "installed",
            Self::Previous => "previous",
            Self::Seed => "seed",
            Self::Update => "update",
            Self::Rollback => "rollback",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub json: String,
    pub version: String,
    pub source: ContentSource,
    pub sha256: String,
    pub path: Option<PathBuf>,
    pub installed_at: Option<u64>,
    pub bytes: u64,
}

impl Snapshot {
    fn embedded() -> Self {
        let bytes = EMBEDDED_SEED.as_bytes();
        let info = validate_bundle(bytes, env!("CARGO_PKG_VERSION"));
        match info {
            Ok(info) => Self {
                json: EMBEDDED_SEED.to_string(),
                version: info.version,
                source: ContentSource::Embedded,
                sha256: info.sha256,
                path: None,
                installed_at: None,
                bytes: info.bytes,
            },
            Err(_) => Self {
                json: EMBEDDED_SEED.to_string(),
                version: "0.0.0".into(),
                source: ContentSource::Embedded,
                sha256: sha256_hex(bytes),
                path: None,
                installed_at: None,
                bytes: bytes.len() as u64,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct HistoryEntry {
    pub version: String,
    pub at: u64,
    pub action: String,
}

impl Default for HistoryEntry {
    fn default() -> Self {
        Self {
            version: String::new(),
            at: 0,
            action: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Meta {
    pub schema_version: u32,
    pub current_version: Option<String>,
    pub previous_version: Option<String>,
    pub installed_at: Option<u64>,
    pub etag: Option<String>,
    pub last_check: Option<u64>,
    pub last_result: Option<String>,
    pub history: Vec<HistoryEntry>,
}

impl Default for Meta {
    fn default() -> Self {
        Self {
            schema_version: 1,
            current_version: None,
            previous_version: None,
            installed_at: None,
            etag: None,
            last_check: None,
            last_result: None,
            history: Vec::new(),
        }
    }
}

impl Meta {
    fn push(&mut self, version: &str, action: &str) {
        self.history.push(HistoryEntry {
            version: version.to_string(),
            at: now_unix(),
            action: action.to_string(),
        });
        if self.history.len() > 20 {
            let excess = self.history.len() - 20;
            self.history.drain(0..excess);
        }
    }
}

// ---------------------------------------------------------------------------
// Content store
// ---------------------------------------------------------------------------

pub struct ContentStore {
    root: PathBuf,
    snapshot: RwLock<Snapshot>,
    meta: RwLock<Meta>,
    last_error: RwLock<Option<String>>,
}

impl ContentStore {
    pub fn new(root: PathBuf) -> Self {
        let store = Self {
            root,
            snapshot: RwLock::new(Snapshot::embedded()),
            meta: RwLock::new(Meta::default()),
            last_error: RwLock::new(None),
        };
        store.bootstrap();
        store
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn content_dir(&self) -> PathBuf {
        self.root.join("content")
    }

    pub fn current_dir(&self) -> PathBuf {
        self.content_dir().join("current")
    }

    pub fn previous_dir(&self) -> PathBuf {
        self.content_dir().join("previous")
    }

    pub fn staging_dir(&self) -> PathBuf {
        self.content_dir().join("staging")
    }

    pub fn current_file(&self) -> PathBuf {
        self.current_dir().join("seed.json")
    }

    pub fn previous_file(&self) -> PathBuf {
        self.previous_dir().join("seed.json")
    }

    pub fn staging_file(&self) -> PathBuf {
        self.staging_dir().join("seed.json")
    }

    pub fn meta_path(&self) -> PathBuf {
        self.root.join("meta.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn snapshot(&self) -> Snapshot {
        lock(&self.snapshot).clone()
    }

    pub fn meta(&self) -> Meta {
        lock(&self.meta).clone()
    }

    pub fn last_error(&self) -> Option<String> {
        lock(&self.last_error).clone()
    }

    pub fn embedded_info(&self) -> Result<BundleInfo, String> {
        validate_bundle(EMBEDDED_SEED.as_bytes(), env!("CARGO_PKG_VERSION"))
    }

    fn set_error(&self, message: impl Into<String>) {
        *lock_mut(&self.last_error) = Some(message.into());
    }

    fn clear_error(&self) {
        *lock_mut(&self.last_error) = None;
    }

    fn bootstrap(&self) {
        let mut errors: Vec<String> = Vec::new();
        if let Err(e) = self.ensure_layout() {
            errors.push(format!("Could not create the data folders: {e}"));
        }

        match read_json::<Meta>(&self.meta_path()) {
            Ok(meta) => *lock_mut(&self.meta) = meta,
            Err(e) => {
                if self.meta_path().exists() {
                    errors.push(format!("meta.json could not be read: {e}"));
                }
            }
        }

        // 1. The installed bundle.
        match self.load_from(&self.current_file(), ContentSource::Installed) {
            Ok(snapshot) => {
                let version = snapshot.version.clone();
                *lock_mut(&self.snapshot) = snapshot;
                let mut meta = lock_mut(&self.meta);
                meta.current_version = Some(version);
                meta.schema_version = 1;
                drop(meta);
                let _ = self.save_meta();
                if !errors.is_empty() {
                    self.set_error(errors.join(" "));
                }
                return;
            }
            Err(e) => {
                if self.current_file().exists() {
                    errors.push(format!("Installed content was rejected: {e}"));
                }
            }
        }

        // 2. The previous bundle, if the current one is damaged.
        match self.load_from(&self.previous_file(), ContentSource::Previous) {
            Ok(snapshot) => {
                let version = snapshot.version.clone();
                let json = snapshot.json.clone();
                *lock_mut(&self.snapshot) = snapshot;
                let mut meta = lock_mut(&self.meta);
                meta.current_version = Some(version.clone());
                meta.push(&version, "recovered-previous");
                drop(meta);
                // Copy the previous bundle into current so the next launch is normal.
                let _ = fs::create_dir_all(self.current_dir());
                let _ = write_atomic(&self.current_file(), json.as_bytes());
                let _ = self.save_meta();
                errors.push("Recovered the previous content version.".into());
                self.set_error(errors.join(" "));
                return;
            }
            Err(e) => {
                if self.previous_file().exists() {
                    errors.push(format!("Previous content was rejected: {e}"));
                }
            }
        }

        // 3. The embedded seed. This is the normal first-run path.
        match self.install_embedded(ContentSource::Seed) {
            Ok(_) => {
                if !errors.is_empty() {
                    self.set_error(errors.join(" "));
                }
            }
            Err(e) => {
                errors.push(format!("Could not install the bundled content: {e}"));
                *lock_mut(&self.snapshot) = Snapshot::embedded();
                self.set_error(errors.join(" "));
            }
        }
    }

    fn ensure_layout(&self) -> std::io::Result<()> {
        fs::create_dir_all(self.current_dir())?;
        fs::create_dir_all(self.previous_dir())?;
        fs::create_dir_all(self.staging_dir())?;
        Ok(())
    }

    fn prepare_staging(&self) -> std::io::Result<()> {
        if self.staging_dir().exists() {
            fs::remove_dir_all(self.staging_dir())?;
        }
        fs::create_dir_all(self.staging_dir())
    }

    fn load_from(&self, path: &Path, source: ContentSource) -> Result<Snapshot, String> {
        let mut file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let mut bytes = Vec::new();
        std::io::Read::by_ref(&mut file)
            .take(MAX_BUNDLE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| format!("{}: {e}", path.display()))?;
        if bytes.len() as u64 > MAX_BUNDLE_BYTES {
            return Err("The installed file exceeds the size limit.".into());
        }
        let info = validate_bundle(&bytes, env!("CARGO_PKG_VERSION"))?;
        let json = String::from_utf8(bytes).map_err(|_| "The content is not valid UTF-8.".to_string())?;
        let installed_at = fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        Ok(Snapshot {
            json,
            version: info.version,
            source,
            sha256: info.sha256,
            path: Some(path.to_path_buf()),
            installed_at,
            bytes: info.bytes,
        })
    }

    pub fn save_meta(&self) -> Result<(), String> {
        let meta = self.meta();
        let bytes = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
        write_atomic(&self.meta_path(), &bytes).map_err(|e| e.to_string())
    }

    /// Install the compiled-in seed. Used on first run and by "restore bundled edition".
    pub fn install_embedded(&self, source: ContentSource) -> Result<Snapshot, String> {
        let bytes = EMBEDDED_SEED.as_bytes();
        // Validate first: a broken build should fail loudly in tests, not at runtime.
        validate_bundle(bytes, env!("CARGO_PKG_VERSION"))?;
        self.prepare_staging().map_err(|e| e.to_string())?;
        write_atomic(&self.staging_file(), bytes).map_err(|e| e.to_string())?;
        self.install_staged(source)
    }

    /// Validate and install bytes supplied by the updater.
    pub fn install_bytes(&self, bytes: &[u8], source: ContentSource) -> Result<Snapshot, String> {
        let info = validate_bundle(bytes, env!("CARGO_PKG_VERSION"))?;
        self.prepare_staging().map_err(|e| e.to_string())?;
        let tmp = self.staging_dir().join("seed.json.tmp");
        write_atomic(&tmp, bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp, self.staging_file()).map_err(|e| e.to_string())?;
        let snapshot = self.install_staged(source)?;
        if snapshot.version != info.version {
            return Err("Internal error: installed version does not match the verified bundle.".into());
        }
        Ok(snapshot)
    }

    /// Swap the verified staging bundle into `current`, keeping the old one for rollback.
    fn install_staged(&self, source: ContentSource) -> Result<Snapshot, String> {
        let info = {
            let mut file = File::open(self.staging_file()).map_err(|e| e.to_string())?;
            let mut bytes = Vec::new();
            std::io::Read::by_ref(&mut file)
                .take(MAX_BUNDLE_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            validate_bundle(&bytes, env!("CARGO_PKG_VERSION"))?
        };

        let current = self.current_dir();
        let previous = self.previous_dir();
        let staging = self.staging_dir();

        if previous.exists() {
            fs::remove_dir_all(&previous).map_err(|e| format!("Could not clear previous: {e}"))?;
        }
        let had_current = current.exists();
        if had_current {
            fs::rename(&current, &previous)
                .map_err(|e| format!("Could not archive the current content: {e}"))?;
        }
        if let Err(e) = fs::rename(&staging, &current) {
            if had_current {
                let _ = fs::rename(&previous, &current);
            }
            return Err(format!("Could not activate the new content: {e}"));
        }

        let json = fs::read_to_string(self.current_file())
            .map_err(|e| format!("Could not read the new content: {e}"))?;
        let snapshot = Snapshot {
            json,
            version: info.version.clone(),
            source,
            sha256: info.sha256.clone(),
            path: Some(self.current_file()),
            installed_at: Some(now_unix()),
            bytes: info.bytes,
        };

        {
            let mut meta = lock_mut(&self.meta);
            let old_version = meta.current_version.clone();
            if old_version.is_some() {
                meta.previous_version = old_version;
            }
            meta.current_version = Some(info.version.clone());
            meta.installed_at = Some(now_unix());
            meta.schema_version = 1;
            meta.push(&info.version, source.as_str());
        }
        *lock_mut(&self.snapshot) = snapshot.clone();
        let _ = self.prepare_staging();
        let _ = self.save_meta();
        self.clear_error();
        Ok(snapshot)
    }

    /// Swap current and previous. Both are validated before anything moves.
    pub fn rollback(&self) -> Result<Snapshot, String> {
        if !self.previous_file().exists() {
            return Err("There is no previous version to roll back to yet.".into());
        }
        let mut file = File::open(self.previous_file()).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        std::io::Read::by_ref(&mut file)
            .take(MAX_BUNDLE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        drop(file);
        let info = validate_bundle(&bytes, env!("CARGO_PKG_VERSION"))?;

        let current = self.current_dir();
        let previous = self.previous_dir();
        let temp = self.content_dir().join("rollback-tmp");
        if temp.exists() {
            fs::remove_dir_all(&temp).map_err(|e| e.to_string())?;
        }
        fs::rename(&current, &temp).map_err(|e| format!("Could not stage the current content: {e}"))?;
        if let Err(e) = fs::rename(&previous, &current) {
            let _ = fs::rename(&temp, &current);
            return Err(format!("Could not restore the previous content: {e}"));
        }
        if let Err(e) = fs::rename(&temp, &previous) {
            // The rollback itself succeeded; keep going and report the cleanup issue.
            let _ = fs::remove_dir_all(&temp);
            let _ = e;
        }

        let json = fs::read_to_string(self.current_file())
            .map_err(|e| format!("Could not read the restored content: {e}"))?;
        let snapshot = Snapshot {
            json,
            version: info.version.clone(),
            source: ContentSource::Rollback,
            sha256: info.sha256,
            path: Some(self.current_file()),
            installed_at: Some(now_unix()),
            bytes: info.bytes,
        };
        {
            let mut meta = lock_mut(&self.meta);
            let old = meta.current_version.replace(info.version.clone());
            meta.previous_version = old;
            meta.installed_at = Some(now_unix());
            meta.push(&info.version, "rollback");
        }
        *lock_mut(&self.snapshot) = snapshot.clone();
        let _ = self.save_meta();
        Ok(snapshot)
    }

    /// Save the ETag / last-check bookkeeping after an update check.
    pub fn record_check(&self, etag: Option<String>, result: &str) {
        {
            let mut meta = lock_mut(&self.meta);
            if etag.is_some() {
                meta.etag = etag;
            }
            meta.last_check = Some(now_unix());
            meta.last_result = Some(result.to_string());
        }
        let _ = self.save_meta();
    }

    pub fn clear_etag(&self) {
        lock_mut(&self.meta).etag = None;
        let _ = self.save_meta();
    }

    pub fn diagnostics(&self) -> ContentDiagnostics {
        let snap = self.snapshot();
        let meta = self.meta();
        ContentDiagnostics {
            version: snap.version,
            source: snap.source.as_str().to_string(),
            sha256: snap.sha256,
            bytes: snap.bytes,
            path: snap.path.as_ref().map(|p| p.display().to_string()),
            installed_at: snap.installed_at,
            previous_version: meta.previous_version,
            last_check: meta.last_check,
            last_result: meta.last_result,
            last_error: self.last_error(),
            embedded_version: self
                .embedded_info()
                .map(|i| i.version)
                .unwrap_or_else(|_| "invalid".into()),
            history: meta.history,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentDiagnostics {
    pub version: String,
    pub source: String,
    pub sha256: String,
    pub bytes: u64,
    pub path: Option<String>,
    pub installed_at: Option<u64>,
    pub previous_version: Option<String>,
    pub last_check: Option<u64>,
    pub last_result: Option<String>,
    pub last_error: Option<String>,
    pub embedded_version: String,
    pub history: Vec<HistoryEntry>,
}

// ---------------------------------------------------------------------------
// Small filesystem helpers
// ---------------------------------------------------------------------------

pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = {
        // Append to the file name instead of replacing the extension: callers
        // may already hand us a path that ends in `.tmp`, and `with_extension`
        // would then return the same path and delete the freshly written file.
        let mut name = path
            .file_name()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid path"))?
            .to_os_string();
        name.push(".tmp");
        path.with_file_name(name)
    };
    if tmp.exists() {
        fs::remove_file(&tmp)?;
    }
    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    #[cfg(windows)]
    if path.exists() {
        // Windows cannot rename over an existing file.
        fs::remove_file(path)?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "quant-org-os-test-{name}-{}-{}",
            std::process::id(),
            now_unix()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn embedded_bundle_is_valid() {
        let info = validate_bundle(EMBEDDED_SEED.as_bytes(), env!("CARGO_PKG_VERSION"))
            .expect("embedded seed must validate");
        assert_eq!(info.version, "1.0.0");
        assert!(info.chapters > 50);
        assert_eq!(info.diagrams, 6);
    }

    #[test]
    fn version_compare_handles_prefixes_and_suffixes() {
        assert!(version_ge("1.2.3", "1.2.3"));
        assert!(version_ge("v1.2.4", "1.2.3"));
        assert!(!version_ge("1.2.3", "1.2.4"));
        assert!(version_ge("2.0.0-beta.1", "2.0.0"));
        assert!(version_gt("1.0.1", "1.0.0"));
        assert!(!version_gt("1.0.0", "1.0.0"));
    }

    #[test]
    fn rejects_wrong_schema_and_duplicate_ids() {
        let mut value: serde_json::Value = serde_json::from_str(EMBEDDED_SEED).unwrap();
        value["schema_version"] = serde_json::json!(2);
        assert!(validate_bundle(value.to_string().as_bytes(), "0.1.0").is_err());

        let mut value: serde_json::Value = serde_json::from_str(EMBEDDED_SEED).unwrap();
        let first = value["parts"][0]["chapters"][0].clone();
        value["parts"][0]["chapters"].as_array_mut().unwrap().push(first);
        assert!(validate_bundle(value.to_string().as_bytes(), "0.1.0").is_err());
    }

    #[test]
    fn rejects_future_min_app_version() {
        let mut value: serde_json::Value = serde_json::from_str(EMBEDDED_SEED).unwrap();
        value["app_min_version"] = serde_json::json!("99.0.0");
        let err = validate_bundle(value.to_string().as_bytes(), "0.1.0").unwrap_err();
        assert!(err.contains("99.0.0"));
    }

    #[test]
    fn first_run_installs_seed_then_rolls_back() {
        let root = temp_root("rollback");
        let store = ContentStore::new(root.clone());
        let snap = store.snapshot();
        assert_eq!(snap.version, "1.0.0");
        assert!(store.current_file().exists());

        // Install a modified bundle as a fake update.
        let mut value: serde_json::Value = serde_json::from_str(EMBEDDED_SEED).unwrap();
        value["content_version"] = serde_json::json!("1.1.0");
        let bytes = value.to_string().into_bytes();
        let installed = store.install_bytes(&bytes, ContentSource::Update).unwrap();
        assert_eq!(installed.version, "1.1.0");
        assert_eq!(store.snapshot().version, "1.1.0");
        assert!(store.previous_file().exists());

        let rolled = store.rollback().unwrap();
        assert_eq!(rolled.version, "1.0.0");
        assert_eq!(store.snapshot().version, "1.0.0");
        assert_eq!(store.meta().previous_version.as_deref(), Some("1.1.0"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupted_current_recovers_previous() {
        let root = temp_root("recover");
        let store = ContentStore::new(root.clone());
        let mut value: serde_json::Value = serde_json::from_str(EMBEDDED_SEED).unwrap();
        value["content_version"] = serde_json::json!("1.1.0");
        store
            .install_bytes(value.to_string().as_bytes(), ContentSource::Update)
            .unwrap();

        fs::write(store.current_file(), b"{ not json").unwrap();
        let reopened = ContentStore::new(root.clone());
        assert_eq!(reopened.snapshot().version, "1.0.0");
        assert_eq!(reopened.snapshot().source, ContentSource::Previous);

        let _ = fs::remove_dir_all(root);
    }
}
