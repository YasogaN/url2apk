use std::fs::{self, File};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::config::{AppConfig, ConfigError, ValidatedConfig};
use crate::trailer::{read_payload, read_trailer, TrailerError};

const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug)]
pub struct LoadedConfig {
    pub config: ValidatedConfig,
    pub icon: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum LoadError {
    #[error("The config file could not be read.")]
    Read(#[from] std::io::Error),
    #[error("The config trailer is invalid: {0}")]
    Trailer(#[from] TrailerError),
    #[error("The config is invalid: {0}")]
    Config(#[from] ConfigError),
    #[error("The app icon is missing.")]
    IconMissing,
    #[error("The app icon is not a PNG image.")]
    IconInvalid,
}

pub fn load(executable: &Path, appimage: Option<&Path>) -> Result<LoadedConfig, LoadError> {
    if let Some(appimage) = appimage {
        let mut file = File::open(appimage)?;
        let (trailer, _) = read_trailer(&mut file)?;
        let payload = read_payload(&mut file, &trailer)?;
        return from_payload(&payload.json, &payload.icon);
    }

    let directory = executable.parent().unwrap_or_else(|| Path::new("."));
    let config_path = directory.join("config.json");
    if config_path.is_file() {
        let json = fs::read(&config_path)?;
        let icon_path = directory.join("icon.png");
        let icon = match fs::read(&icon_path) {
            Ok(icon) => icon,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Err(LoadError::IconMissing);
            }
            Err(error) => return Err(LoadError::Read(error)),
        };
        return from_payload(&json, &icon);
    }

    let mut file = File::open(executable)?;
    let (trailer, _) = read_trailer(&mut file)?;
    let payload = read_payload(&mut file, &trailer)?;
    from_payload(&payload.json, &payload.icon)
}

fn from_payload(json: &[u8], icon: &[u8]) -> Result<LoadedConfig, LoadError> {
    if icon.is_empty() {
        return Err(LoadError::IconMissing);
    }
    if !icon.starts_with(PNG_MAGIC) {
        return Err(LoadError::IconInvalid);
    }
    let config = AppConfig::from_json(json)?;
    Ok(LoadedConfig {
        config,
        icon: icon.to_vec(),
    })
}

pub fn sidecar_paths(executable: &Path) -> (PathBuf, PathBuf) {
    let directory = executable.parent().unwrap_or_else(|| Path::new("."));
    (directory.join("config.json"), directory.join("icon.png"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const CONFIG: &[u8] =
        br#"{"schema":1,"id":"napp-0123456789ab","url":"https://example.com/","name":"Example","width":1200,"height":780}"#;
    const ICON: &[u8] = b"\x89PNG\r\n\x1a\nrest";

    fn write_sidecar(dir: &Path, config: &[u8], icon: &[u8]) {
        fs::write(dir.join("config.json"), config).unwrap();
        fs::write(dir.join("icon.png"), icon).unwrap();
    }

    fn trailer_bytes(
        json_offset: u64,
        json_length: u64,
        icon_offset: u64,
        icon_length: u64,
        payload_offset: u64,
    ) -> Vec<u8> {
        let mut bytes = vec![0u8; 64];
        bytes[..4].copy_from_slice(b"NAPP");
        bytes[4..6].copy_from_slice(&1u16.to_le_bytes());
        bytes[8..16].copy_from_slice(&json_offset.to_le_bytes());
        bytes[16..24].copy_from_slice(&json_length.to_le_bytes());
        bytes[24..32].copy_from_slice(&icon_offset.to_le_bytes());
        bytes[32..40].copy_from_slice(&icon_length.to_le_bytes());
        bytes[40..48].copy_from_slice(&payload_offset.to_le_bytes());
        bytes
    }

    fn write_trailer_file(path: &Path, json: &[u8], icon: &[u8]) -> Vec<u8> {
        let mut file = b"base".to_vec();
        let json_offset = file.len() as u64;
        file.extend_from_slice(json);
        let icon_offset = file.len() as u64;
        file.extend_from_slice(icon);
        file.extend_from_slice(&trailer_bytes(
            json_offset,
            json.len() as u64,
            icon_offset,
            icon.len() as u64,
            json_offset,
        ));
        fs::write(path, &file).unwrap();
        file
    }

    #[test]
    fn loads_a_sidecar_config() {
        let dir = tempdir().unwrap();
        write_sidecar(dir.path(), CONFIG, ICON);
        let executable = dir.path().join("Example");
        fs::write(&executable, b"binary").unwrap();
        let loaded = load(&executable, None).unwrap();
        assert_eq!(loaded.config.name, "Example");
        assert_eq!(loaded.icon, ICON);
    }

    #[test]
    fn loads_an_appimage_trailer() {
        let dir = tempdir().unwrap();
        let appimage = dir.path().join("Example.AppImage");
        write_trailer_file(&appimage, CONFIG, ICON);
        let executable = dir.path().join("usr/bin/shell");
        let loaded = load(&executable, Some(&appimage)).unwrap();
        assert_eq!(loaded.config.url.as_str(), "https://example.com/");
        assert_eq!(loaded.icon, ICON);
    }

    #[test]
    fn loads_a_self_trailer_when_the_sidecar_is_absent() {
        let dir = tempdir().unwrap();
        let executable = dir.path().join("Example");
        write_trailer_file(&executable, CONFIG, ICON);
        let loaded = load(&executable, None).unwrap();
        assert_eq!(loaded.config.id, "napp-0123456789ab");
    }

    #[test]
    fn rejects_a_missing_icon() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("config.json"), CONFIG).unwrap();
        let executable = dir.path().join("Example");
        fs::write(&executable, b"binary").unwrap();
        assert!(matches!(
            load(&executable, None),
            Err(LoadError::IconMissing)
        ));
    }

    #[test]
    fn rejects_an_empty_or_invalid_icon() {
        let dir = tempdir().unwrap();
        let executable = dir.path().join("Example");
        fs::write(&executable, b"binary").unwrap();
        write_sidecar(dir.path(), CONFIG, b"");
        assert!(matches!(
            load(&executable, None),
            Err(LoadError::IconMissing)
        ));
        write_sidecar(dir.path(), CONFIG, b"not a png");
        assert!(matches!(
            load(&executable, None),
            Err(LoadError::IconInvalid)
        ));
    }

    #[test]
    fn rejects_invalid_config() {
        let dir = tempdir().unwrap();
        let executable = dir.path().join("Example");
        fs::write(&executable, b"binary").unwrap();
        write_sidecar(dir.path(), b"not json", ICON);
        assert!(matches!(load(&executable, None), Err(LoadError::Config(_))));
    }

    #[test]
    fn rejects_a_missing_appimage_file() {
        let dir = tempdir().unwrap();
        let executable = dir.path().join("Example");
        fs::write(&executable, b"binary").unwrap();
        assert!(matches!(
            load(&executable, Some(&dir.path().join("missing.AppImage"))),
            Err(LoadError::Read(_))
        ));
    }

    #[test]
    fn rejects_files_without_a_trailer() {
        let dir = tempdir().unwrap();
        let executable = dir.path().join("Example");
        fs::write(&executable, b"short").unwrap();
        assert!(matches!(
            load(&executable, None),
            Err(LoadError::Trailer(TrailerError::TooSmall))
        ));
    }

    #[test]
    fn exposes_sidecar_paths() {
        let (config, icon) = sidecar_paths(Path::new("/tmp/Example"));
        assert_eq!(config, Path::new("/tmp/config.json"));
        assert_eq!(icon, Path::new("/tmp/icon.png"));
    }
}
