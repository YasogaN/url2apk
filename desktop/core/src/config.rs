use serde::Deserialize;
use url::Url;

pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_NAME_CHARS: usize = 64;
pub const MIN_WIDTH: u32 = 320;
pub const MAX_WIDTH: u32 = 7680;
pub const MIN_HEIGHT: u32 = 240;
pub const MAX_HEIGHT: u32 = 4320;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub schema: u32,
    pub id: String,
    pub url: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedConfig {
    pub id: String,
    pub url: Url,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("The config is not valid JSON.")]
    Json,
    #[error("The config schema is not supported.")]
    Schema,
    #[error("The app id is invalid.")]
    Id,
    #[error("The URL must be an HTTPS URL without credentials.")]
    Url,
    #[error("The app name is invalid.")]
    Name,
}

impl AppConfig {
    pub fn from_json(bytes: &[u8]) -> Result<ValidatedConfig, ConfigError> {
        let config: AppConfig = serde_json::from_slice(bytes).map_err(|_| ConfigError::Json)?;
        config.validate()
    }

    pub fn validate(self) -> Result<ValidatedConfig, ConfigError> {
        if self.schema != SCHEMA_VERSION {
            return Err(ConfigError::Schema);
        }
        if !valid_id(&self.id) {
            return Err(ConfigError::Id);
        }
        let url = Url::parse(&self.url).map_err(|_| ConfigError::Url)?;
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.host_str().is_none()
        {
            return Err(ConfigError::Url);
        }
        let name = self.name.trim().to_string();
        if name.is_empty()
            || name.chars().count() > MAX_NAME_CHARS
            || name.chars().any(char::is_control)
        {
            return Err(ConfigError::Name);
        }
        Ok(ValidatedConfig {
            id: self.id,
            url,
            name,
            width: self.width.clamp(MIN_WIDTH, MAX_WIDTH),
            height: self.height.clamp(MIN_HEIGHT, MAX_HEIGHT),
        })
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}
