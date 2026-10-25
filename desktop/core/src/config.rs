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
        let config: AppConfig =
            serde_json::from_slice(bytes).map_err(|_| ConfigError::Json)?;
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
        && id
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(overrides: &str) -> Vec<u8> {
        format!(
            r#"{{"schema":1,"id":"napp-0123456789ab","url":"https://example.com/","name":"Example","width":1200,"height":780{overrides}}}"#
        )
        .into_bytes()
    }

    #[test]
    fn accepts_a_valid_config() {
        let config = AppConfig::from_json(&json("")).unwrap();
        assert_eq!(config.id, "napp-0123456789ab");
        assert_eq!(config.url.as_str(), "https://example.com/");
        assert_eq!(config.name, "Example");
        assert_eq!(config.width, 1200);
        assert_eq!(config.height, 780);
    }

    #[test]
    fn trims_the_name_and_clamps_dimensions() {
        let config = AppConfig::from_json(&json("")).unwrap();
        assert_eq!(config.name, "Example");
        let small = AppConfig::from_json(
            br#"{"schema":1,"id":"a","url":"https://example.com/","name":"  Example  ","width":0,"height":0}"#,
        )
        .unwrap();
        assert_eq!(small.name, "Example");
        assert_eq!(small.width, MIN_WIDTH);
        assert_eq!(small.height, MIN_HEIGHT);
        let large = AppConfig::from_json(
            br#"{"schema":1,"id":"a","url":"https://example.com/","name":"Example","width":99999,"height":99999}"#,
        )
        .unwrap();
        assert_eq!(large.width, MAX_WIDTH);
        assert_eq!(large.height, MAX_HEIGHT);
    }

    #[test]
    fn rejects_invalid_json() {
        assert_eq!(AppConfig::from_json(b"not json").unwrap_err(), ConfigError::Json);
        assert_eq!(
            AppConfig::from_json(br#"{"schema":1}"#).unwrap_err(),
            ConfigError::Json
        );
        assert_eq!(
            AppConfig::from_json(
                br#"{"schema":1,"id":"a","url":"https://example.com/","name":"Example","width":-1,"height":1}"#
            )
            .unwrap_err(),
            ConfigError::Json
        );
    }

    #[test]
    fn rejects_unsupported_schemas() {
        for schema in [0, 2] {
            let bytes = format!(
                r#"{{"schema":{schema},"id":"a","url":"https://example.com/","name":"Example","width":1,"height":1}}"#
            );
            assert_eq!(
                AppConfig::from_json(bytes.as_bytes()).unwrap_err(),
                ConfigError::Schema
            );
        }
    }

    #[test]
    fn rejects_invalid_ids() {
        for id in ["", "UPPER", "with_underscore", "with/slash", "with.dot"] {
            let bytes = format!(
                r#"{{"schema":1,"id":"{id}","url":"https://example.com/","name":"Example","width":1,"height":1}}"#
            );
            assert_eq!(
                AppConfig::from_json(bytes.as_bytes()).unwrap_err(),
                ConfigError::Id
            );
        }
        let long = "a".repeat(65);
        let bytes = format!(
            r#"{{"schema":1,"id":"{long}","url":"https://example.com/","name":"Example","width":1,"height":1}}"#
        );
        assert_eq!(AppConfig::from_json(bytes.as_bytes()).unwrap_err(), ConfigError::Id);
    }

    #[test]
    fn rejects_invalid_urls() {
        for url in [
            "http://example.com/",
            "https://user:pass@example.com/",
            "https://user@example.com/",
            "https://",
            "not a url",
        ] {
            let bytes = format!(
                r#"{{"schema":1,"id":"a","url":"{url}","name":"Example","width":1,"height":1}}"#
            );
            assert_eq!(
                AppConfig::from_json(bytes.as_bytes()).unwrap_err(),
                ConfigError::Url
            );
        }
    }

    #[test]
    fn rejects_invalid_names() {
        for name in ["", "   ", "line\\nbreak"] {
            let bytes = format!(
                r#"{{"schema":1,"id":"a","url":"https://example.com/","name":"{name}","width":1,"height":1}}"#
            );
            assert_eq!(
                AppConfig::from_json(bytes.as_bytes()).unwrap_err(),
                ConfigError::Name
            );
        }
        let long = "a".repeat(65);
        let bytes = format!(
            r#"{{"schema":1,"id":"a","url":"https://example.com/","name":"{long}","width":1,"height":1}}"#
        );
        assert_eq!(AppConfig::from_json(bytes.as_bytes()).unwrap_err(), ConfigError::Name);
    }
}
