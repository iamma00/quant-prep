//! User preferences, persisted next to the content.

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::content::{read_json, write_atomic};

pub const DEFAULT_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/iamma00/quant-prep/main/updates/manifest.json";

pub const THEMES: [&str; 4] = ["system", "light", "dark", "sepia"];
pub const DENSITIES: [&str; 2] = ["comfortable", "compact"];
pub const VIEWS: [&str; 10] = [
    "home",
    "read",
    "levels",
    "tracks",
    "comp",
    "org",
    "checklists",
    "glossary",
    "settings",
    "about",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub schema_version: u32,
    pub theme: String,
    pub font_scale: f32,
    pub density: String,
    pub reduce_motion: bool,
    pub default_view: String,
    pub manifest_url: String,
    pub auto_check: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: "system".into(),
            font_scale: 1.0,
            density: "comfortable".into(),
            reduce_motion: false,
            default_view: "home".into(),
            manifest_url: DEFAULT_MANIFEST_URL.into(),
            auto_check: true,
        }
    }
}

impl Settings {
    pub fn load(root: &Path) -> Self {
        let path = root.join("settings.json");
        match read_json::<Settings>(&path) {
            Ok(mut settings) => {
                settings.sanitize();
                settings
            }
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, root: &Path) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        write_atomic(&root.join("settings.json"), &bytes).map_err(|e| e.to_string())
    }

    /// Clamp and normalise every field. Never trust a settings file or IPC payload.
    pub fn sanitize(&mut self) {
        self.schema_version = 1;
        if !THEMES.contains(&self.theme.as_str()) {
            self.theme = "system".into();
        }
        if !self.font_scale.is_finite() {
            self.font_scale = 1.0;
        }
        self.font_scale = (self.font_scale * 100.0).round() / 100.0;
        self.font_scale = self.font_scale.clamp(0.85, 1.4);
        if !DENSITIES.contains(&self.density.as_str()) {
            self.density = "comfortable".into();
        }
        if !VIEWS.contains(&self.default_view.as_str()) {
            self.default_view = "home".into();
        }
        if self.manifest_url.trim().is_empty() {
            self.manifest_url = DEFAULT_MANIFEST_URL.into();
        }
        self.manifest_url = self.manifest_url.trim().to_string();
        if self.manifest_url.len() > 500 {
            self.manifest_url = DEFAULT_MANIFEST_URL.into();
        }
    }
}

/// Validate a manifest URL without fetching it.
///
/// HTTPS is required, except for loopback addresses used during local testing.
/// Credentials and non-standard ports are rejected.
pub fn validate_https_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "That is not a valid URL.".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs with embedded credentials are not allowed.".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "The URL has no host.".to_string())?
        .to_ascii_lowercase();
    let loopback = host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1";
    match url.scheme() {
        "https" => {}
        "http" if loopback => {}
        _ => return Err("Updates must use HTTPS (HTTP is allowed only for localhost).".into()),
    }
    if let Some(port) = url.port() {
        if !loopback && port != 443 {
            return Err("Remote update URLs must use the standard HTTPS port (443).".into());
        }
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if !ip.is_loopback() {
            return Err("IP addresses are not allowed in update URLs.".into());
        }
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let mut settings = Settings::default();
        settings.sanitize();
        assert_eq!(settings.theme, "system");
        assert!(validate_https_url(&settings.manifest_url).is_ok());
    }

    #[test]
    fn bad_values_are_clamped() {
        let mut settings = Settings {
            theme: "neon".into(),
            font_scale: 99.0,
            density: "tiny".into(),
            default_view: "nowhere".into(),
            manifest_url: "".into(),
            ..Default::default()
        };
        settings.sanitize();
        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font_scale, 1.4);
        assert_eq!(settings.density, "comfortable");
        assert_eq!(settings.default_view, "home");
        assert_eq!(settings.manifest_url, DEFAULT_MANIFEST_URL);
    }

    #[test]
    fn url_rules_reject_unsafe_inputs() {
        assert!(validate_https_url("https://example.com/manifest.json").is_ok());
        assert!(validate_https_url("http://localhost:8080/manifest.json").is_ok());
        assert!(validate_https_url("http://example.com/manifest.json").is_err());
        assert!(validate_https_url("file:///etc/passwd").is_err());
        assert!(validate_https_url("https://user:pass@example.com/x").is_err());
        assert!(validate_https_url("https://127.0.0.1/x").is_ok());
        assert!(validate_https_url("https://8.8.8.8/x").is_err());
    }
}
