//! Tauri commands: the only surface the webview can call.

use serde::Serialize;
use std::path::Path;
use std::sync::RwLock;
use tauri::{AppHandle, Emitter, State};

use crate::content::{now_unix, write_atomic, ContentDiagnostics, ContentSource, Meta, Snapshot};
use crate::settings::{validate_https_url, Settings};
use crate::update::{InstallOutcome, UpdateInfo};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ContentPayload {
    pub json: String,
    pub version: String,
    pub source: String,
    pub sha256: String,
    pub bytes: u64,
    pub installed_at: Option<u64>,
    pub path: Option<String>,
}

impl From<Snapshot> for ContentPayload {
    fn from(snapshot: Snapshot) -> Self {
        Self {
            json: snapshot.json,
            version: snapshot.version,
            source: snapshot.source.as_str().to_string(),
            sha256: snapshot.sha256,
            bytes: snapshot.bytes,
            installed_at: snapshot.installed_at,
            path: snapshot.path.as_ref().map(|p| p.display().to_string()),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Bootstrap {
    pub content: ContentPayload,
    pub embedded_version: String,
    pub settings: Settings,
    pub meta: Meta,
    pub app_version: String,
    pub identifier: String,
    pub platform: String,
    pub arch: String,
    pub data_dir: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ContentStatus {
    pub version: String,
    pub source: String,
    pub sha256: String,
    pub bytes: u64,
    pub previous_version: Option<String>,
}

impl ContentStatus {
    fn new(snapshot: Snapshot, previous: Option<String>) -> Self {
        Self {
            version: snapshot.version,
            source: snapshot.source.as_str().to_string(),
            sha256: snapshot.sha256,
            bytes: snapshot.bytes,
            previous_version: previous,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Diagnostics {
    pub generated_at: u64,
    pub app_version: String,
    pub identifier: String,
    pub platform: String,
    pub arch: String,
    pub data_dir: String,
    pub content: ContentDiagnostics,
    pub settings: Settings,
    pub update_busy: bool,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> Bootstrap {
    let content = state.content.snapshot();
    let embedded_version = state
        .content
        .embedded_info()
        .map(|i| i.version)
        .unwrap_or_else(|_| "invalid".into());
    Bootstrap {
        content: ContentPayload::from(content),
        embedded_version,
        settings: state.settings(),
        meta: state.content.meta(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        identifier: "com.quantorg.os".into(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        data_dir: state.data_dir.display().to_string(),
        last_error: state.content.last_error(),
    }
}

#[tauri::command]
pub fn get_content(state: State<'_, AppState>) -> ContentPayload {
    ContentPayload::from(state.content.snapshot())
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<Settings, String> {
    settings.sanitize();
    validate_https_url(&settings.manifest_url).map_err(|e| format!("Manifest URL: {e}"))?;
    settings.save(&state.data_dir)?;
    let mut guard = state
        .settings
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub async fn check_updates(
    app: AppHandle,
    state: State<'_, AppState>,
    force: bool,
) -> Result<UpdateInfo, String> {
    let state = state.inner().clone();
    let _guard = state.update_lock.lock().await;
    crate::update::check(&app, &state.content, &state.settings(), force).await
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<InstallOutcome, String> {
    let state = state.inner().clone();
    let _guard = state.update_lock.lock().await;
    let settings = state.settings();
    crate::update::install(&app, &state.content, &settings).await
}

#[tauri::command]
pub fn rollback_content(app: AppHandle, state: State<'_, AppState>) -> Result<ContentStatus, String> {
    let previous = state.content.snapshot().version;
    let snapshot = state.content.rollback()?;
    let status = ContentStatus::new(snapshot.clone(), Some(previous));
    let _ = app.emit(
        "content:changed",
        serde_json::json!({ "version": snapshot.version, "source": snapshot.source.as_str() }),
    );
    Ok(status)
}

#[tauri::command]
pub fn reset_content(app: AppHandle, state: State<'_, AppState>) -> Result<ContentStatus, String> {
    let previous = state.content.snapshot().version;
    let snapshot = state.content.install_embedded(ContentSource::Seed)?;
    let status = ContentStatus::new(snapshot.clone(), Some(previous));
    let _ = app.emit(
        "content:changed",
        serde_json::json!({ "version": snapshot.version, "source": snapshot.source.as_str() }),
    );
    Ok(status)
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "That is not a valid URL.".to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("Only http(s) links can be opened.".into());
    }
    if url.len() > 2_000 {
        return Err("The link is too long.".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open the link: {e}"))
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    let path = &state.data_dir;
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    open_folder(path)
}

#[cfg(target_os = "windows")]
fn open_folder(path: &Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the data folder: {e}"))
}

#[cfg(target_os = "macos")]
fn open_folder(path: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the data folder: {e}"))
}

#[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
fn open_folder(path: &Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the data folder: {e}"))
}

#[cfg(target_os = "android")]
fn open_folder(_path: &Path) -> Result<(), String> {
    Err("Android does not expose an app data folder to the file manager. Use Diagnostics instead.".into())
}

fn diagnostics_inner(state: &AppState) -> Diagnostics {
    Diagnostics {
        generated_at: now_unix(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        identifier: "com.quantorg.os".into(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        data_dir: state.data_dir.display().to_string(),
        content: state.content.diagnostics(),
        settings: state.settings(),
        update_busy: state.update_lock.try_lock().is_err(),
    }
}

#[tauri::command]
pub fn diagnostics(state: State<'_, AppState>) -> Diagnostics {
    diagnostics_inner(&state)
}

#[tauri::command]
pub fn save_diagnostics(state: State<'_, AppState>) -> Result<String, String> {
    let report = diagnostics_inner(&state);
    let mut text = String::new();
    text.push_str("Quant Org OS — diagnostics\n");
    text.push_str("==========================\n\n");
    text.push_str(&serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?);
    text.push_str("\n\nThis file contains no personal data and no telemetry.\n");
    let path = state
        .data_dir
        .join(format!("diagnostics-{}.txt", now_unix()));
    write_atomic(&path, text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Small helper used by tests and the UI to read the current settings lock.
#[allow(dead_code)]
pub fn settings_snapshot(lock: &RwLock<Settings>) -> Settings {
    lock.read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}
