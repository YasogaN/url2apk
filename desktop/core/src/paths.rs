use std::path::{Path, PathBuf};

pub fn data_dir(base: &Path, id: &str) -> PathBuf {
    base.join("url2app").join(id).join("webview")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_a_per_app_data_directory() {
        assert_eq!(
            data_dir(Path::new("/home/user/.local/share"), "napp-0123456789ab"),
            Path::new("/home/user/.local/share/url2app/napp-0123456789ab/webview")
        );
    }
}
