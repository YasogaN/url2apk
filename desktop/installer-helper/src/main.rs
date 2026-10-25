use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use url2app_shell_core::trailer::{read_payload, read_trailer, TRAILER_SIZE};
use url2app_shell_core::AppConfig;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("URL to App installer: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    let (installer, target) = parse_args(std::env::args().skip(1))?;
    install(&installer, &target)?;
    Ok(())
}

fn parse_args<I>(args: I) -> Result<(PathBuf, PathBuf)>
where
    I: IntoIterator<Item = String>,
{
    let mut installer = None;
    let mut target = None;
    let mut args = args.into_iter();
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--installer" => installer = args.next().map(PathBuf::from),
            "--target" => target = args.next().map(PathBuf::from),
            other => return Err(format!("Unknown argument: {other}").into()),
        }
    }
    let installer = installer.ok_or("Missing --installer")?;
    let target = target.ok_or("Missing --target")?;
    Ok((installer, target))
}

fn install(installer: &Path, target: &Path) -> Result<()> {
    let mut file = File::open(installer)?;
    let (trailer, file_length) = read_trailer(&mut file)?;
    let payload = read_payload(&mut file, &trailer)?;
    let config = AppConfig::from_json(&payload.json)?;

    fs::create_dir_all(target)?;
    fs::write(target.join("config.json"), &payload.json)?;
    fs::write(target.join("icon.png"), &payload.icon)?;

    let icon_end = trailer.icon_offset + trailer.icon_length;
    let ico_end = file_length - TRAILER_SIZE;
    if ico_end > icon_end {
        let mut ico = vec![0u8; (ico_end - icon_end) as usize];
        file.seek(SeekFrom::Start(icon_end))?;
        file.read_exact(&mut ico)?;
        fs::write(target.join("app.ico"), ico)?;
    }

    write_meta(&target.join("meta.ini"), &config.name, &config.id)?;
    Ok(())
}

fn write_meta(path: &Path, name: &str, id: &str) -> Result<()> {
    let content = format!("[app]\r\nname={name}\r\nid={id}\r\n");
    let mut bytes = vec![0xff, 0xfe];
    for unit in content.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(path, bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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
    fn rejects_invalid_config() {
        let dir = tempdir().unwrap();
        let installer = dir.path().join("setup.exe");
        fs::write(&installer, build_installer(b"no", ICON, ICO)).unwrap();
        assert!(install(&installer, &dir.path().join("out")).is_err());
    }
}
