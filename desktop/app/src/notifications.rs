use tauri::WebviewWindow;
use webkit2gtk::{NotificationExt, WebViewExt};

pub fn install(window: &WebviewWindow, app_name: &str) {
    let app_name = app_name.to_string();
    let _ = window.with_webview(move |webview| {
        let webview = webview.inner();
        webview.connect_show_notification(move |_webview, notification| {
            let title = notification
                .title()
                .map(|value| value.to_string())
                .unwrap_or_default();
            let body = notification
                .body()
                .map(|value| value.to_string())
                .unwrap_or_default();
            let _ = notify_rust::Notification::new()
                .appname(&app_name)
                .summary(&title)
                .body(&body)
                .show();
            true
        });
    });
}
