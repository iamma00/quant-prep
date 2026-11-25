//! Content update protocol.
//!
//! 1. Fetch a small JSON manifest over HTTPS (ETag-aware).
//! 2. Validate every field, including the bundle URL and hash.
//! 3. Stream the bundle with a hard size cap and hash it as it arrives.
//! 4. Verify SHA-256 and the bundle's own structure.
//! 5. Hand the bytes to the content store, which swaps atomically and keeps
//!    the previous version for rollback.
//!
//! The app never executes downloaded code. A bundle is data only: text, tables
//! and SVG diagrams rendered in a CSP-locked webview.

use reqwest::redirect::Policy;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::net::IpAddr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::content::{
    is_version_like, now_unix, validate_bundle, version_ge, version_gt, ContentSource, ContentStore,
    Snapshot, MAX_BUNDLE_BYTES,
};
use crate::settings::{validate_https_url, Settings};

const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_NOTES_CHARS: usize = 4_000;
const MAX_REDIRECTS: usize = 5;
const DOWNLOAD_ATTEMPTS: u32 = 2;

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub schema_version: u32,
    pub content_version: String,
    #[serde(default = "zero_version", alias = "min_app_version")]
    pub app_min_version: String,
    pub bundle_url: String,
    pub bundle_sha256: String,
    pub bundle_size: u64,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub published_at: Option<String>,
}

fn zero_version() -> String {
    "0.0.0".into()
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub remote_version: String,
    pub notes: String,
    pub bundle_size: u64,
    pub published_at: Option<String>,
    pub app_min_version: String,
    pub checked_at: u64,
    pub not_modified: bool,
    pub manifest_url: String,
    pub blocked_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallOutcome {
    pub installed: bool,
    pub version: String,
    pub previous_version: Option<String>,
    pub message: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
struct Progress {
    phase: String,
    received: u64,
    total: u64,
    percent: Option<u8>,
}

fn emit_progress(app: &AppHandle, phase: &str, received: u64, total: u64) {
    let percent = if total > 0 {
        Some(((received.min(total) * 100) / total).min(100) as u8)
    } else {
        None
    };
    let _ = app.emit(
        "update:progress",
        Progress {
            phase: phase.to_string(),
            received,
            total,
            percent,
        },
    );
}

// ---------------------------------------------------------------------------
// URL and manifest validation
// ---------------------------------------------------------------------------

fn is_loopback(host: &str) -> bool {
    let host = host.trim_matches(['[', ']']);
    host.eq_ignore_ascii_case("localhost")
        || host == "::1"
        || host
            .parse::<IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
}

fn host_allowed(host: &str, manifest_host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let manifest_host = manifest_host.to_ascii_lowercase();
    host == manifest_host
        || is_loopback(&host)
        || host == "github.com"
        || host == "api.github.com"
        || host == "codeload.github.com"
        || host.ends_with(".githubusercontent.com")
}

fn build_client(manifest_host: String) -> Result<Client, String> {
    let policy = Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            return attempt.stop();
        }
        let url = attempt.url();
        let host = url.host_str().unwrap_or_default();
        let scheme_ok = url.scheme() == "https" || (url.scheme() == "http" && is_loopback(host));
        if !scheme_ok || !host_allowed(host, &manifest_host) {
            return attempt.stop();
        }
        attempt.follow()
    });
    Client::builder()
        .redirect(policy)
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(300))
        .user_agent(format!("QuantOrgOS/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Could not initialise the network client: {e}"))
}

fn clean_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\t' | '\r'))
        .take(max_chars)
        .collect()
}

fn validate_manifest(manifest: &Manifest, manifest_url: &Url) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err(format!(
            "The update manifest uses schema {}; this app supports schema 1.",
            manifest.schema_version
        ));
    }
    if !is_version_like(&manifest.content_version) {
        return Err("The manifest's content_version is not a valid version.".into());
    }
    if !manifest.app_min_version.is_empty() && !is_version_like(&manifest.app_min_version) {
        return Err("The manifest's app_min_version is not a valid version.".into());
    }
    if manifest.bundle_size == 0 {
        return Err("The manifest does not declare a bundle size.".into());
    }
    if manifest.bundle_size > MAX_BUNDLE_BYTES {
        return Err(format!(
            "The update is larger than the {} MB safety limit.",
            MAX_BUNDLE_BYTES / 1024 / 1024
        ));
    }
    let hash = manifest.bundle_sha256.trim().to_ascii_lowercase();
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("The manifest's bundle_sha256 is not a valid SHA-256 hash.".into());
    }
    let bundle_url = validate_https_url(&manifest.bundle_url)?;
    let manifest_host = manifest_url.host_str().unwrap_or_default();
    let bundle_host = bundle_url.host_str().unwrap_or_default();
    if !host_allowed(bundle_host, manifest_host) {
        return Err(format!(
            "The bundle URL points to {bundle_host}, which is not an allowed update host."
        ));
    }
    Ok(())
}

fn normalise_manifest(mut manifest: Manifest) -> Manifest {
    manifest.content_version = manifest.content_version.trim().to_string();
    manifest.app_min_version = manifest.app_min_version.trim().to_string();
    manifest.bundle_sha256 = manifest.bundle_sha256.trim().to_ascii_lowercase();
    manifest.notes = clean_text(&manifest.notes, MAX_NOTES_CHARS);
    if manifest.notes.trim().is_empty() {
        manifest.notes = "No release notes were provided.".into();
    }
    if let Some(published) = &manifest.published_at {
        manifest.published_at = Some(clean_text(published, 64));
    }
    manifest
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

fn friendly_network_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "The update request timed out. Your installed content still works offline.".into()
    } else if error.is_connect() {
        "Could not reach the update server. Check your connection — the installed content still works offline.".into()
    } else {
        format!("The update request failed: {error}")
    }
}

fn friendly_status(status: StatusCode) -> String {
    match status.as_u16() {
        401 | 403 => format!(
            "The update server refused the request (HTTP {}). If the repository is private, the manifest must be publicly readable.",
            status.as_u16()
        ),
        404 => "The update manifest was not found (404). Check the manifest URL in Settings.".into(),
        408 | 429 => format!("The update server is busy (HTTP {}). Try again in a minute.", status.as_u16()),
        code if (500..600).contains(&code) => {
            format!("The update server is temporarily unavailable (HTTP {code}).")
        }
        code => format!("The update server returned an unexpected response (HTTP {code})."),
    }
}

async fn read_capped(response: reqwest::Response, cap: u64) -> Result<Vec<u8>, String> {
    if let Some(length) = response.content_length() {
        if length > cap {
            return Err("The server response is larger than the safety limit.".into());
        }
    }
    let mut response = response;
    let mut out = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| friendly_network_error(&e))?
    {
        if out.len() as u64 + chunk.len() as u64 > cap {
            return Err("The server response is larger than the safety limit.".into());
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

struct Fetched {
    manifest: Manifest,
    etag: Option<String>,
    not_modified: bool,
}

async fn fetch_manifest(
    client: &Client,
    url: &Url,
    etag: Option<&str>,
) -> Result<Fetched, String> {
    let mut last_error = String::new();
    for attempt in 0..DOWNLOAD_ATTEMPTS {
        let mut request = client.get(url.clone()).header("Accept", "application/json");
        if let Some(tag) = etag {
            request = request.header("If-None-Match", tag);
        }
        match request.send().await {
            Ok(response) => {
                let status = response.status();
                let response_etag = response
                    .headers()
                    .get(reqwest::header::ETAG)
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_string);
                if status == StatusCode::NOT_MODIFIED {
                    return Ok(Fetched {
                        manifest: Manifest {
                            schema_version: 1,
                            content_version: "0.0.0".into(),
                            app_min_version: "0.0.0".into(),
                            bundle_url: String::new(),
                            bundle_sha256: String::new(),
                            bundle_size: 0,
                            notes: String::new(),
                            published_at: None,
                        },
                        etag: response_etag,
                        not_modified: true,
                    });
                }
                if !status.is_success() {
                    last_error = friendly_status(status);
                    let retryable = status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS;
                    if retryable && attempt + 1 < DOWNLOAD_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis(900 * (attempt as u64 + 1))).await;
                        continue;
                    }
                    return Err(last_error);
                }
                let bytes = read_capped(response, MAX_MANIFEST_BYTES).await?;
                let manifest: Manifest = serde_json::from_slice(&bytes)
                    .map_err(|e| format!("The update manifest is not valid JSON: {e}"))?;
                let manifest = normalise_manifest(manifest);
                validate_manifest(&manifest, url)?;
                return Ok(Fetched {
                    manifest,
                    etag: response_etag,
                    not_modified: false,
                });
            }
            Err(error) => {
                last_error = friendly_network_error(&error);
                if attempt + 1 < DOWNLOAD_ATTEMPTS {
                    tokio::time::sleep(Duration::from_millis(900 * (attempt as u64 + 1))).await;
                    continue;
                }
            }
        }
    }
    Err(last_error)
}

async fn download_bundle(
    app: &AppHandle,
    client: &Client,
    manifest: &Manifest,
) -> Result<Vec<u8>, String> {
    let url = validate_https_url(&manifest.bundle_url)?;
    let mut last_error = String::new();

    for attempt in 0..DOWNLOAD_ATTEMPTS {
        emit_progress(app, "download", 0, manifest.bundle_size);
        match client.get(url.clone()).send().await {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    last_error = friendly_status(status);
                    let retryable =
                        status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS;
                    if retryable && attempt + 1 < DOWNLOAD_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis(1200 * (attempt as u64 + 1))).await;
                        continue;
                    }
                    return Err(last_error);
                }
                if let Some(length) = response.content_length() {
                    if length > MAX_BUNDLE_BYTES {
                        return Err("The update is larger than the safety limit.".into());
                    }
                }
                let total = response.content_length().unwrap_or(manifest.bundle_size);
                let mut response = response;
                let mut bytes = Vec::with_capacity(total.min(MAX_BUNDLE_BYTES) as usize);
                let mut received = 0u64;
                let mut last_emit = Instant::now();
                let mut interrupted: Option<String> = None;

                loop {
                    match response.chunk().await {
                        Ok(Some(chunk)) => {
                            received += chunk.len() as u64;
                            if received > MAX_BUNDLE_BYTES {
                                return Err(format!(
                                    "The download exceeded the {} MB safety limit.",
                                    MAX_BUNDLE_BYTES / 1024 / 1024
                                ));
                            }
                            bytes.extend_from_slice(&chunk);
                            if last_emit.elapsed() >= Duration::from_millis(120) {
                                emit_progress(app, "download", received, total);
                                last_emit = Instant::now();
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            interrupted = Some(friendly_network_error(&error));
                            break;
                        }
                    }
                }
                if interrupted.is_none() && received < manifest.bundle_size {
                    interrupted = Some(format!(
                        "The download stopped early ({received} of {} bytes).",
                        manifest.bundle_size
                    ));
                }
                if let Some(message) = interrupted {
                    last_error = message;
                    if attempt + 1 < DOWNLOAD_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis(1200 * (attempt as u64 + 1))).await;
                        continue;
                    }
                    return Err(last_error);
                }
                emit_progress(app, "download", received, total.max(received));
                return Ok(bytes);
            }
            Err(error) => {
                last_error = friendly_network_error(&error);
                if attempt + 1 < DOWNLOAD_ATTEMPTS {
                    tokio::time::sleep(Duration::from_millis(1200 * (attempt as u64 + 1))).await;
                    continue;
                }
            }
        }
    }
    Err(last_error)
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

pub async fn check(
    app: &AppHandle,
    store: &ContentStore,
    settings: &Settings,
    force: bool,
) -> Result<UpdateInfo, String> {
    let manifest_url = validate_https_url(&settings.manifest_url)?;
    let host = manifest_url.host_str().unwrap_or_default().to_string();
    let client = build_client(host)?;
    let cached_etag = if force { None } else { store.meta().etag };
    emit_progress(app, "manifest", 0, 0);

    let fetched = match fetch_manifest(&client, &manifest_url, cached_etag.as_deref()).await {
        Ok(fetched) => fetched,
        Err(error) => {
            store.record_check(None, &format!("error: {error}"));
            return Err(error);
        }
    };

    let current = store.snapshot();
    let checked_at = now_unix();

    if fetched.not_modified {
        store.record_check(fetched.etag, "up-to-date (not modified)");
        return Ok(UpdateInfo {
            available: false,
            current_version: current.version.clone(),
            remote_version: current.version,
            notes: String::new(),
            bundle_size: 0,
            published_at: None,
            app_min_version: "0.0.0".into(),
            checked_at,
            not_modified: true,
            manifest_url: settings.manifest_url.clone(),
            blocked_reason: None,
        });
    }

    let manifest = fetched.manifest;
    let newer = version_gt(&manifest.content_version, &current.version);
    let blocked_reason = if newer && !version_ge(env!("CARGO_PKG_VERSION"), &manifest.app_min_version) {
        Some(format!(
            "This content needs app version {} or newer. Update the app from GitHub Releases first.",
            manifest.app_min_version
        ))
    } else {
        None
    };
    let available = newer && blocked_reason.is_none();

    let check_result = if available {
        format!("available: {}", manifest.content_version)
    } else if newer {
        "blocked: app update required".to_string()
    } else {
        "up-to-date".to_string()
    };
    store.record_check(fetched.etag, &check_result);

    Ok(UpdateInfo {
        available,
        current_version: current.version,
        remote_version: manifest.content_version,
        notes: manifest.notes,
        bundle_size: manifest.bundle_size,
        published_at: manifest.published_at,
        app_min_version: manifest.app_min_version,
        checked_at,
        not_modified: false,
        manifest_url: settings.manifest_url.clone(),
        blocked_reason,
    })
}

pub async fn install(
    app: &AppHandle,
    store: &ContentStore,
    settings: &Settings,
) -> Result<InstallOutcome, String> {
    let manifest_url = validate_https_url(&settings.manifest_url)?;
    let host = manifest_url.host_str().unwrap_or_default().to_string();
    let client = build_client(host)?;

    emit_progress(app, "manifest", 0, 0);
    let fetched = fetch_manifest(&client, &manifest_url, None).await?;
    if fetched.not_modified {
        return Ok(InstallOutcome {
            installed: false,
            version: store.snapshot().version,
            previous_version: None,
            message: "You already have the latest content.".into(),
            notes: String::new(),
        });
    }
    let manifest = fetched.manifest;
    let current = store.snapshot();

    if !version_gt(&manifest.content_version, &current.version) {
        store.record_check(fetched.etag, "up-to-date");
        return Ok(InstallOutcome {
            installed: false,
            version: current.version,
            previous_version: None,
            message: "You already have the latest content.".into(),
            notes: manifest.notes,
        });
    }
    if !version_ge(env!("CARGO_PKG_VERSION"), &manifest.app_min_version) {
        return Err(format!(
            "This content needs app version {} or newer. You have {}. Update the app from GitHub Releases.",
            manifest.app_min_version,
            env!("CARGO_PKG_VERSION")
        ));
    }

    let bytes = download_bundle(app, &client, &manifest).await?;
    emit_progress(app, "verify", bytes.len() as u64, manifest.bundle_size);

    if bytes.len() as u64 != manifest.bundle_size {
        return Err(format!(
            "The download size does not match the manifest ({} vs {} bytes). Nothing was installed.",
            bytes.len(),
            manifest.bundle_size
        ));
    }
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = hex::encode(hasher.finalize());
    if hash != manifest.bundle_sha256 {
        return Err(
            "The download failed its integrity check (SHA-256 mismatch). Nothing was installed."
                .into(),
        );
    }
    let info = validate_bundle(&bytes, env!("CARGO_PKG_VERSION"))?;
    if info.version != manifest.content_version {
        return Err(format!(
            "The bundle reports version {}, but the manifest says {}. Nothing was installed.",
            info.version, manifest.content_version
        ));
    }

    emit_progress(app, "install", 0, 0);
    let previous = current.version.clone();
    let snapshot: Snapshot = store.install_bytes(&bytes, ContentSource::Update)?;
    store.record_check(fetched.etag, &format!("installed: {}", snapshot.version));
    emit_progress(app, "done", 1, 1);
    let _ = app.emit(
        "content:changed",
        serde_json::json!({
            "version": snapshot.version,
            "source": snapshot.source.as_str(),
        }),
    );

    Ok(InstallOutcome {
        installed: true,
        version: snapshot.version,
        previous_version: Some(previous),
        message: "Content updated and verified. The previous version is available for rollback."
            .into(),
        notes: manifest.notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> Manifest {
        Manifest {
            schema_version: 1,
            content_version: "1.1.0".into(),
            app_min_version: "0.1.0".into(),
            bundle_url: "https://github.com/iamma00/quant-org-os/releases/download/x/seed.json".into(),
            bundle_sha256: "a".repeat(64),
            bundle_size: 1000,
            notes: "notes".into(),
            published_at: None,
        }
    }

    #[test]
    fn manifest_validation_accepts_github_and_same_host() {
        let url = Url::parse("https://raw.githubusercontent.com/iamma00/quant-org-os/main/updates/manifest.json").unwrap();
        assert!(validate_manifest(&manifest(), &url).is_ok());
        let mut same_host = manifest();
        same_host.bundle_url = "https://raw.githubusercontent.com/iamma00/quant-org-os/main/seed.json".into();
        assert!(validate_manifest(&same_host, &url).is_ok());
    }

    #[test]
    fn manifest_validation_rejects_bad_hosts_and_hashes() {
        let url = Url::parse("https://raw.githubusercontent.com/x/y/main/manifest.json").unwrap();
        let mut evil = manifest();
        evil.bundle_url = "https://evil.example/seed.json".into();
        assert!(validate_manifest(&evil, &url).is_err());

        let mut bad_hash = manifest();
        bad_hash.bundle_sha256 = "nope".into();
        assert!(validate_manifest(&bad_hash, &url).is_err());

        let mut too_big = manifest();
        too_big.bundle_size = MAX_BUNDLE_BYTES + 1;
        assert!(validate_manifest(&too_big, &url).is_err());

        let mut http = manifest();
        http.bundle_url = "http://github.com/x".into();
        assert!(validate_manifest(&http, &url).is_err());
    }

    #[test]
    fn notes_are_sanitised() {
        let mut m = manifest();
        m.notes = format!("{}\u{0007}", "x".repeat(10_000));
        let m = normalise_manifest(m);
        assert!(m.notes.chars().count() <= MAX_NOTES_CHARS);
        assert!(!m.notes.contains('\u{0007}'));
    }
}
