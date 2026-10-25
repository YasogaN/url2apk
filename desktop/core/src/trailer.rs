use std::io::{Read, Seek, SeekFrom};

use thiserror::Error;

pub const TRAILER_SIZE: u64 = 64;
pub const TRAILER_VERSION: u16 = 1;

pub const MAGIC: &[u8; 4] = b"NAPP";
pub const MAGIC_OFFSET: usize = 0;
pub const VERSION_OFFSET: usize = 4;
pub const JSON_OFFSET: usize = 8;
pub const JSON_LENGTH: usize = 16;
pub const ICON_OFFSET: usize = 24;
pub const ICON_LENGTH: usize = 32;
pub const PAYLOAD_OFFSET: usize = 40;

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
        let trailer = bytes
            .get(..TRAILER_SIZE as usize)
            .ok_or(TrailerError::TooSmall)?;
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
    let bytes = trailer.get(start..start + 8).ok_or(TrailerError::Offsets)?;
    let mut value = [0u8; 8];
    value.copy_from_slice(bytes);
    Ok(u64::from_le_bytes(value))
}

pub fn read_trailer<R: Read + Seek>(reader: &mut R) -> Result<(Trailer, u64), TrailerError> {
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
