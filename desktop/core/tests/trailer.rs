use std::io::{Read, Seek, SeekFrom};
use url2app_shell_core::trailer::*;

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
    bytes[VERSION_OFFSET..VERSION_OFFSET + 2].copy_from_slice(&TRAILER_VERSION.to_le_bytes());
    bytes[JSON_OFFSET..JSON_OFFSET + 8].copy_from_slice(&json_offset.to_le_bytes());
    bytes[JSON_LENGTH..JSON_LENGTH + 8].copy_from_slice(&json_length.to_le_bytes());
    bytes[ICON_OFFSET..ICON_OFFSET + 8].copy_from_slice(&icon_offset.to_le_bytes());
    bytes[ICON_LENGTH..ICON_LENGTH + 8].copy_from_slice(&icon_length.to_le_bytes());
    bytes[PAYLOAD_OFFSET..PAYLOAD_OFFSET + 8].copy_from_slice(&payload_offset.to_le_bytes());
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
        Trailer::parse(&trailer_bytes(10, u64::MAX, 20, 0, 10), 100),
        Err(TrailerError::Offsets)
    ));
    assert!(matches!(
        Trailer::parse(&trailer_bytes(10, 1, u64::MAX, 2, 10), 100),
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
