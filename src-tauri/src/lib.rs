//! Quant Org OS — offline-first desktop and mobile shell.
//!
//! The Rust side owns three things:
//!   * the content bundle (embedded seed, installed copy, atomic updates, rollback)
//!   * user settings
//!   * the update protocol and its integrity checks
//!
//! Everything else — rendering, navigation, search, checklists — is plain
//! HTML/CSS/JS in `ui/`, with no network access at runtime.

mod commands;
mod content;
mod settings;
mod update;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::Manager;

use content::ContentStore;
use settings::Settings;

#[derive(Clone)]
pub struct AppState {
    pub content: Arc<ContentStore>,
    pub settings: Arc<RwLock<Settings>>,
    pub data_dir: PathBuf,
    pub update_lock: Arc<tokio::sync::Mutex<()>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let settings = Settings::load(&data_dir);
        let content = ContentStore::new(data_dir.clone());
        Self {
            content: Arc::new(content),
            settings: Arc::new(RwLock::new(settings)),
            data_dir,
            update_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    match app.path().app_data_dir() {
        Ok(path) => path,
        Err(_) => {
            // Extremely defensive: a read-only or unavailable profile should
            // never prevent the app from opening. The temp folder is the last
            // resort, and the UI surfaces the path in Settings.
            std::env::temp_dir().join("quant-org-os")
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = resolve_data_dir(app.handle());
            let state = AppState::new(data_dir);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::get_content,
            commands::save_settings,
            commands::check_updates,
            commands::install_update,
            commands::rollback_content,
            commands::reset_content,
            commands::open_external,
            commands::open_data_dir,
            commands::diagnostics,
            commands::save_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quant Org OS");
}
