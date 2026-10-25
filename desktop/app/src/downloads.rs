use tauri::webview::{DownloadEvent, Webview};

pub fn handler() -> impl for<'a> Fn(Webview, DownloadEvent<'a>) -> bool + Send + Sync + 'static {
    |_webview, event| match event {
        DownloadEvent::Requested { destination, .. } => {
            let name = destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("download");
            match rfd::FileDialog::new().set_file_name(name).save_file() {
                Some(path) => {
                    *destination = path;
                    true
                }
                None => false,
            }
        }
        DownloadEvent::Finished { .. } => true,
        _ => true,
    }
}
