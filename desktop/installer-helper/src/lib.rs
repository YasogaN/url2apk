use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use url2app_shell_core::trailer::{read_payload, read_trailer, TRAILER_SIZE};
use url2app_shell_core::AppConfig;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

pub fn run_with<I>(args: I) -> Result<()>
where
    I: IntoIterator<Item = String>,
{
    let (installer, target) = parse_args(args)?;
    install(&installer, &target)?;
    Ok(())
}

pub fn parse_args<I>(args: I) -> Result<(PathBuf, PathBuf)>
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

pub fn install(installer: &Path, target: &Path) -> Result<()> {
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

    let folder = folder_name(&config.name, &config.id);
    write_meta(&target.join("meta.ini"), &config.name, &config.id, &folder)?;
    Ok(())
}

pub fn folder_name(name: &str, id: &str) -> String {
    let mut folder = String::new();
    for character in name.chars() {
        if character.is_control()
            || matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        {
            if !folder.ends_with('-') {
                folder.push('-');
            }
        } else {
            folder.push(character);
        }
    }
    let folder = folder.trim().trim_end_matches(['.', ' ']);
    let folder = if folder.is_empty() { "app" } else { folder };
    let suffix: String = id
        .chars()
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let suffix = if suffix.is_empty() {
        "app"
    } else {
        suffix.as_str()
    };
    format!("{folder}-{suffix}")
}

fn write_meta(path: &Path, name: &str, id: &str, folder: &str) -> Result<()> {
    let content = format!("[app]\r\nname={name}\r\nid={id}\r\nfolder={folder}\r\n");
    let mut bytes = vec![0xff, 0xfe];
    for unit in content.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(path, bytes)?;
    Ok(())
}
