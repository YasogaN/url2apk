use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tauri::webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, Wry};
use url::Url;
use url2app_shell_core::policy::{popup_decision, PopupDecision};
use url2app_shell_core::PermissionStore;

use crate::{downloads, permissions, script};

pub fn handle(
    app: &AppHandle,
    base: &Url,
    data_dir: &Path,
    store: &Arc<PermissionStore>,
    counter: &Arc<AtomicUsize>,
    app_name: &str,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<Wry> {
    match popup_decision(base, &url) {
        PopupDecision::InApp => {
            let label = format!("popup-{}", counter.fetch_add(1, Ordering::Relaxed));
            let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url.clone()))
                .title(url.as_str())
                .inner_size(900.0, 700.0)
                .data_directory(data_dir.to_path_buf())
                .window_features(features)
                .on_navigation(|target| {
                    if target.scheme() == "https" || target.as_str() == "about:blank" {
                        true
                    } else {
                        let _ = open::that(target.as_str());
                        false
                    }
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(downloads::handler())
                .on_permission_request(permissions::handler(
                    Arc::clone(store),
                    app_name.to_string(),
                ))
                .on_page_load(|webview, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        let _ = webview.eval(script::KEYBOARD);
                    }
                });
            match builder.build() {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => {
                    let _ = open::that(url.as_str());
                    NewWindowResponse::Deny
                }
            }
        }
        PopupDecision::External => {
            let _ = open::that(url.as_str());
            NewWindowResponse::Deny
        }
        PopupDecision::Deny => NewWindowResponse::Deny,
    }
}
