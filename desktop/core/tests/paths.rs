use std::path::Path;
use url2app_shell_core::paths::*;

#[test]
fn derives_a_per_app_data_directory() {
    assert_eq!(
        data_dir(Path::new("/home/user/.local/share"), "napp-0123456789ab"),
        Path::new("/home/user/.local/share/url2app/napp-0123456789ab/webview")
    );
}
