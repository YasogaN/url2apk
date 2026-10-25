use std::fs;
use std::path::Path;

use tempfile::tempdir;
use url2app_installer_helper::*;

const JSON: &[u8] =
        br#"{"schema":1,"id":"napp-0123456789ab","url":"https://example.com/","name":"Example","width":1200,"height":780}"#;
const ICON: &[u8] = b"\x89PNG\r\n\x1a\nicon";
const ICO: &[u8] = b"ico-bytes";

fn build_installer(json: &[u8], icon: &[u8], ico: &[u8]) -> Vec<u8> {
    let base = b"installer".to_vec();
    let base_len = base.len() as u64;
    let json_offset = base_len;
    let icon_offset = json_offset + json.len() as u64;
    let mut file = base;
    file.extend_from_slice(json);
    file.extend_from_slice(icon);
    file.extend_from_slice(ico);
    let mut trailer = vec![0u8; 64];
    trailer[..4].copy_from_slice(b"NAPP");
    trailer[4..6].copy_from_slice(&1u16.to_le_bytes());
    trailer[8..16].copy_from_slice(&json_offset.to_le_bytes());
    trailer[16..24].copy_from_slice(&(json.len() as u64).to_le_bytes());
    trailer[24..32].copy_from_slice(&icon_offset.to_le_bytes());
    trailer[32..40].copy_from_slice(&(icon.len() as u64).to_le_bytes());
    trailer[40..48].copy_from_slice(&base_len.to_le_bytes());
    file.extend_from_slice(&trailer);
    file
}

#[test]
fn parses_arguments() {
    let (installer, target) = parse_args([
        "--installer".to_string(),
        "setup.exe".to_string(),
        "--target".to_string(),
        "out".to_string(),
    ])
    .unwrap();
    assert_eq!(installer, Path::new("setup.exe"));
    assert_eq!(target, Path::new("out"));
    assert!(parse_args(["--unknown".to_string()]).is_err());
    assert!(parse_args(["--installer".to_string(), "setup.exe".to_string()]).is_err());
    assert!(parse_args(["--target".to_string(), "out".to_string()]).is_err());
}

#[test]
fn writes_config_icon_ico_and_meta() {
    let dir = tempdir().unwrap();
    let installer = dir.path().join("setup.exe");
    fs::write(&installer, build_installer(JSON, ICON, ICO)).unwrap();
    let target = dir.path().join("out");
    install(&installer, &target).unwrap();
    assert_eq!(fs::read(target.join("config.json")).unwrap(), JSON);
    assert_eq!(fs::read(target.join("icon.png")).unwrap(), ICON);
    assert_eq!(fs::read(target.join("app.ico")).unwrap(), ICO);
    let meta = fs::read(target.join("meta.ini")).unwrap();
    assert_eq!(&meta[..2], &[0xff, 0xfe]);
    let text = String::from_utf16(
        &meta[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert!(text.contains("name=Example\r\n"));
    assert!(text.contains("id=napp-0123456789ab\r\n"));
}

#[test]
fn tolerates_a_missing_ico() {
    let dir = tempdir().unwrap();
    let installer = dir.path().join("setup.exe");
    fs::write(&installer, build_installer(JSON, ICON, b"")).unwrap();
    let target = dir.path().join("out");
    install(&installer, &target).unwrap();
    assert!(!target.join("app.ico").exists());
}

#[test]
fn runs_with_arguments() {
    let dir = tempdir().unwrap();
    let installer = dir.path().join("setup.exe");
    fs::write(&installer, build_installer(JSON, ICON, ICO)).unwrap();
    let target = dir.path().join("out");
    run_with([
        "--installer".to_string(),
        installer.display().to_string(),
        "--target".to_string(),
        target.display().to_string(),
    ])
    .unwrap();
    assert!(target.join("app.ico").exists());
    assert!(run_with(["--bad".to_string()]).is_err());
}

#[test]
fn rejects_invalid_config() {
    let dir = tempdir().unwrap();
    let installer = dir.path().join("setup.exe");
    fs::write(&installer, build_installer(b"no", ICON, ICO)).unwrap();
    assert!(install(&installer, &dir.path().join("out")).is_err());
}
