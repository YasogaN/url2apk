use std::io::Cursor;

use backhand::{FilesystemReader, FilesystemWriter};
use wasm_bindgen::prelude::*;

const DESKTOP_PATHS: &[&str] = &[
    "/url2app-shell.desktop",
    "/URL to App Shell.desktop",
    "/usr/share/applications/URL to App Shell.desktop",
];

const ICON_PATHS: &[&str] = &[
    "/url2app-shell.png",
    "/URL to App Shell.png",
    "/usr/share/icons/hicolor/256x256/apps/url2app-shell.png",
];

fn repack_bytes(
    squashfs: &[u8],
    desktop: &[u8],
    icon: &[u8],
) -> Result<Vec<u8>, String> {
    let reader = FilesystemReader::from_reader(Cursor::new(squashfs))
        .map_err(|error| format!("Could not read the AppImage filesystem: {error}"))?;
    let mut writer = FilesystemWriter::from_fs_reader(&reader)
        .map_err(|error| format!("Could not prepare the AppImage filesystem: {error}"))?;

    let mut replaced = 0;
    for path in DESKTOP_PATHS {
        if writer
            .replace_file(path, Cursor::new(desktop.to_vec()))
            .is_ok()
        {
            replaced += 1;
        }
    }
    for path in ICON_PATHS {
        if writer
            .replace_file(path, Cursor::new(icon.to_vec()))
            .is_ok()
        {
            replaced += 1;
        }
    }
    if replaced == 0 {
        return Err("The AppImage has no known desktop or icon entry.".to_string());
    }

    let mut output = Cursor::new(Vec::new());
    writer
        .write(&mut output)
        .map_err(|error| format!("Could not write the AppImage filesystem: {error}"))?;
    Ok(output.into_inner())
}

#[wasm_bindgen]
pub fn repack(squashfs: &[u8], desktop: &[u8], icon: &[u8]) -> Result<Vec<u8>, JsValue> {
    repack_bytes(squashfs, desktop, icon).map_err(|error| JsValue::from_str(&error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use backhand::{FilesystemWriter, NodeHeader};

    const DESKTOP: &[u8] = b"Name=Original\n";
    const ICON: &[u8] = b"original-icon";

    #[test]
    fn replaces_known_desktop_and_icon_paths() {
        let header = NodeHeader {
            permissions: 0o644,
            ..NodeHeader::default()
        };
        let mut writer = FilesystemWriter::default();
        writer.set_compressor(
            backhand::FilesystemCompressor::new(backhand::compression::Compressor::Gzip, None)
                .unwrap(),
        );
        writer.push_file(Cursor::new(DESKTOP), "url2app-shell.desktop", header).unwrap();
        writer.push_file(Cursor::new(ICON), "url2app-shell.png", header).unwrap();
        let mut base = Cursor::new(Vec::new());
        writer.write(&mut base).unwrap();

        let output = repack_bytes(
            &base.into_inner(),
            b"Name=Modified\n",
            b"modified-icon",
        )
        .unwrap();
        let reader = FilesystemReader::from_reader(Cursor::new(output)).unwrap();
        let mut found = std::collections::HashMap::new();
        for node in reader.files() {
            if let backhand::InnerNode::File(file) = &node.inner {
                let mut bytes = Vec::new();
                std::io::Read::read_to_end(
                    &mut reader.file(file).reader(),
                    &mut bytes,
                )
                .unwrap();
                found.insert(node.fullpath.to_string_lossy().into_owned(), bytes);
            }
        }
        assert_eq!(found.get("/url2app-shell.desktop"), Some(&b"Name=Modified\n".to_vec()));
        assert_eq!(found.get("/url2app-shell.png"), Some(&b"modified-icon".to_vec()));
    }
}
