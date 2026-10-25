use std::path::{Path, PathBuf};

pub fn data_dir(base: &Path, id: &str) -> PathBuf {
    base.join("url2app").join(id).join("webview")
}
