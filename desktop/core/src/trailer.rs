use std::io::{Read, Seek, SeekFrom};

use thiserror::Error;

pub const TRAILER_SIZE: u64 = 64;
pub const TRAILER_VERSION: u16 = 1;

const MAGIC: &[u8; 4] = b"NAPP";
const MAGIC_OFFSET: usize = 0;
const VERSION_OFFSET: usize = 4;
const JSON_OFFSET: usize = 8;
const JSON_LENGTH: usize = 16;
const ICON_OFFSET: usize = 24;
const ICON_LENGTH: usize = 32;
const PAYLOAD_OFFSET: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trailer {
    pub json_offset: u64,
    pub json_length: u64,
    pub icon_offset: u64,
    pub icon_length: u64,
    pub payload_offset: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Payload {
    pub json: Vec<u8>,
    pub icon: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum TrailerError {
    #[error("The file is too small to contain a config trailer.")]
    TooSmall,
    #[error("The config trailer is missing.")]
    Missing,
    #[error("The config trailer version is not supported.")]
    Version,
    #[error("The config trailer has out-of-range offsets.")]
    Offsets,
    #[error("The config trailer range is invalid.")]
    Range,
    #[error("The config trailer could not be read.")]
    Io(#[from] std::io::Error),
}

impl Trailer {
    pub fn parse(bytes: &[u8], file_length: u64) -> Result<Self, TrailerError> {
        let trailer = bytes.get(..TRAILER_SIZE as usize).ok_or(TrailerError::TooSmall)?;
        let file_length = file_length
            .checked_sub(TRAILER_SIZE)
            .ok_or(TrailerError::TooSmall)?;
        if &trailer[MAGIC_OFFSET..MAGIC_OFFSET + 4] != MAGIC {
            return Err(TrailerError::Missing);
        }
        if u16::from_le_bytes([trailer[VERSION_OFFSET], trailer[VERSION_OFFSET + 1]])
            != TRAILER_VERSION
        {
            return Err(TrailerError::Version);
        }

        let json_offset = offset(trailer, JSON_OFFSET)?;
        let json_length = offset(trailer, JSON_LENGTH)?;
        let icon_offset = offset(trailer, ICON_OFFSET)?;
        let icon_length = offset(trailer, ICON_LENGTH)?;
        let payload_offset = offset(trailer, PAYLOAD_OFFSET)?;
        let json_end = json_offset
            .checked_add(json_length)
            .ok_or(TrailerError::Offsets)?;
        let icon_end = icon_offset
            .checked_add(icon_length)
            .ok_or(TrailerError::Offsets)?;

        if payload_offset == 0 || payload_offset > json_offset {
            return Err(TrailerError::Range);
        }
        if json_length == 0 || json_end > icon_offset {
            return Err(TrailerError::Range);
        }
        if icon_end > file_length {
            return Err(TrailerError::Range);
        }
        Ok(Self {
            json_offset,
            json_length,
            icon_offset,
            icon_length,
            payload_offset,
        })
    }
}

fn offset(trailer: &[u8], start: usize) -> Result<u64, TrailerError> {
    let bytes = trailer
        .get(start..start + 8)
        .ok_or(TrailerError::Offsets)?;
    let mut value = [0u8; 8];
    value.copy_from_slice(bytes);
    Ok(u64::from_le_bytes(value))
}

pub fn read_trailer<R: Read + Seek>(
    reader: &mut R,
) -> Result<(Trailer, u64), TrailerError> {
    let file_length = reader.seek(SeekFrom::End(0))?;
    if file_length < TRAILER_SIZE {
        return Err(TrailerError::TooSmall);
    }
    reader.seek(SeekFrom::End(-(TRAILER_SIZE as i64)))?;
    let mut bytes = [0u8; TRAILER_SIZE as usize];
    reader.read_exact(&mut bytes)?;
    let trailer = Trailer::parse(&bytes, file_length)?;
    Ok((trailer, file_length))
}

pub fn read_payload<R: Read + Seek>(
    reader: &mut R,
    trailer: &Trailer,
) -> Result<Payload, TrailerError> {
    let json = read_range(reader, trailer.json_offset, trailer.json_length)?;
    let icon = read_range(reader, trailer.icon_offset, trailer.icon_length)?;
    Ok(Payload { json, icon })
}

fn read_range<R: Read + Seek>(
    reader: &mut R,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, TrailerError> {
    reader.seek(SeekFrom::Start(offset))?;
    let mut bytes = vec![0u8; length as usize];
    reader.read_exact(&mut bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn trailer_bytes(
        json_offset: u64,
        json_length: u64,
        icon_offset: u64,
        icon_length: u64,
        payload_offset: u64,
    ) -> Vec<u8> {
        let mut bytes = vec![0u8; TRAILER_SIZE as usize];
        bytes[MAGIC_OFFSET..MAGIC_OFFSET + 4].copy_from_slice(MAGIC);
        bytes[VERSION_OFFSET..VERSION_OFFSET + 2]
            .copy_from_slice(&TRAILER_VERSION.to_le_bytes());
        bytes[JSON_OFFSET..JSON_OFFSET + 8].copy_from_slice(&json_offset.to_le_bytes());
        bytes[JSON_LENGTH..JSON_LENGTH + 8].copy_from_slice(&json_length.to_le_bytes());
        bytes[ICON_OFFSET..ICON_OFFSET + 8].copy_from_slice(&icon_offset.to_le_bytes());
        bytes[ICON_LENGTH..ICON_LENGTH + 8].copy_from_slice(&icon_length.to_le_bytes());
        bytes[PAYLOAD_OFFSET..PAYLOAD_OFFSET + 8]
            .copy_from_slice(&payload_offset.to_le_bytes());
        bytes
    }

    fn build_file(base: &[u8], json: &[u8], icon: &[u8]) -> Vec<u8> {
        let json_offset = base.len() as u64;
        let icon_offset = json_offset + json.len() as u64;
        let mut file = Vec::new();
        file.extend_from_slice(base);
        file.extend_from_slice(json);
        file.extend_from_slice(icon);
        file.extend_from_slice(&trailer_bytes(
            json_offset,
            json.len() as u64,
            icon_offset,
            icon.len() as u64,
            base.len() as u64,
        ));
        file
    }

    #[test]
    fn reads_a_valid_payload() {
        let file = build_file(b"base", br#"{"name":"Example"}"#, b"icon");
        let mut cursor = Cursor::new(file);
        let (trailer, length) = read_trailer(&mut cursor).unwrap();
        assert_eq!(length, cursor.get_ref().len() as u64);
        assert_eq!(trailer.json_offset, 4);
        assert_eq!(trailer.icon_offset, 4 + 18);
        assert_eq!(trailer.payload_offset, 4);
        let payload = read_payload(&mut cursor, &trailer).unwrap();
        assert_eq!(payload.json, br#"{"name":"Example"}"#);
        assert_eq!(payload.icon, b"icon");
    }

    #[test]
    fn accepts_an_empty_icon() {
        let file = build_file(b"base", b"json", b"");
        let mut cursor = Cursor::new(file);
        let (trailer, _) = read_trailer(&mut cursor).unwrap();
        let payload = read_payload(&mut cursor, &trailer).unwrap();
        assert!(payload.icon.is_empty());
    }

    #[test]
    fn rejects_a_short_file() {
        let mut cursor = Cursor::new(vec![0u8; 63]);
        assert!(matches!(
            read_trailer(&mut cursor),
            Err(TrailerError::TooSmall)
        ));
    }

    #[test]
    fn rejects_a_missing_magic() {
        let mut bytes = trailer_bytes(1, 1, 2, 0, 1);
        bytes[0] = 0;
        assert!(matches!(
            Trailer::parse(&bytes, 100),
            Err(TrailerError::Missing)
        ));
    }

    #[test]
    fn rejects_an_unsupported_version() {
        let mut bytes = trailer_bytes(1, 1, 2, 0, 1);
        bytes[VERSION_OFFSET..VERSION_OFFSET + 2].copy_from_slice(&2u16.to_le_bytes());
        assert!(matches!(
            Trailer::parse(&bytes, 100),
            Err(TrailerError::Version)
        ));
    }

    #[test]
    fn rejects_short_or_missing_trailer_slices() {
        assert!(matches!(
            Trailer::parse(&[0u8; 63], 100),
            Err(TrailerError::TooSmall)
        ));
        assert!(matches!(
            Trailer::parse(&trailer_bytes(1, 1, 2, 0, 1), 63),
            Err(TrailerError::TooSmall)
        ));
    }

    #[test]
    fn rejects_invalid_ranges() {
        for (json_offset, json_length, icon_offset, icon_length, payload_offset) in [
            (10, 2, 12, 2, 0),
            (10, 2, 12, 2, 11),
            (10, 0, 12, 2, 10),
            (10, 3, 12, 2, 10),
            (10, 2, 12, 3, 10),
        ] {
            assert!(matches!(
                Trailer::parse(
                    &trailer_bytes(
                        json_offset,
                        json_length,
                        icon_offset,
                        icon_length,
                        payload_offset
                    ),
                    64
                ),
                Err(TrailerError::Range)
            ));
        }
    }

    #[test]
    fn rejects_overflowing_ranges() {
        assert!(matches!(
            Trailer::parse(
                &trailer_bytes(10, u64::MAX, 20, 0, 10),
                100
            ),
            Err(TrailerError::Offsets)
        ));
        assert!(matches!(
            Trailer::parse(
                &trailer_bytes(10, 1, u64::MAX, 2, 10),
                100
            ),
            Err(TrailerError::Offsets)
        ));
    }

    #[test]
    fn reports_io_errors() {
        struct Failing;
        impl Read for Failing {
            fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(std::io::ErrorKind::Other, "boom"))
            }
        }
        impl Seek for Failing {
            fn seek(&mut self, _pos: SeekFrom) -> std::io::Result<u64> {
                Ok(64)
            }
        }
        let mut reader = Failing;
        assert!(matches!(
            read_trailer(&mut reader),
            Err(TrailerError::Io(_))
        ));
        let trailer = Trailer::parse(&trailer_bytes(10, 1, 11, 0, 10), 100).unwrap();
        let mut reader = Failing;
        assert!(matches!(
            read_payload(&mut reader, &trailer),
            Err(TrailerError::Io(_))
        ));
    }
}
