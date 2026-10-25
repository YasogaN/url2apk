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
