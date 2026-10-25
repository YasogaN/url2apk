#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod downloads;
mod permissions;
mod popups;
mod script;

#[cfg(windows)]
mod aumid;
#[cfg(target_os = "linux")]
mod notifications;

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;

use tauri::image::Image;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url2app_shell_core::paths::data_dir;
use url2app_shell_core::policy::{navigation_decision, NavigationDecision};
use url2app_shell_core::{load, LoadedConfig, PermissionStore};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Err(error) = run(app.handle()) {
                rfd::MessageDialog::new()
                    .set_title("URL to App")
                    .set_description(error)
                    .set_buttons(rfd::MessageButtons::Ok)
                    .show();
                std::process::exit(1);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}

fn run(app: &AppHandle) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let appimage = std::env::var_os("APPIMAGE").map(PathBuf::from);
    let loaded = load(&executable, appimage.as_deref()).map_err(|error| error.to_string())?;
    let base = dirs::data_local_dir()
        .ok_or_else(|| "The local data directory is unavailable.".to_string())?;
    let data = data_dir(&base, &loaded.config.id);
    std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    let store = Arc::new(PermissionStore::load(data.join("permissions.json")));
    let counter = Arc::new(AtomicUsize::new(0));
    let window = build_main(app, &loaded, &data, &store, &counter)?;

    #[cfg(target_os = "linux")]
    notifications::install(&window, &loaded.config.name);
    #[cfg(windows)]
    aumid::set(&loaded.config.id);
    let _ = &window;

    Ok(())
}

fn build_main(
    app: &AppHandle,
    loaded: &LoadedConfig,
    data: &Path,
    store: &Arc<PermissionStore>,
    counter: &Arc<AtomicUsize>,
) -> Result<WebviewWindow, String> {
    let base = loaded.config.url.clone();
    let app_name = loaded.config.name.clone();
    let icon = Image::from_bytes(&loaded.icon).map_err(|error| error.to_string())?;
    let app_for_popups = app.clone();
    let base_for_popups = base.clone();
    let data_for_popups = data.to_path_buf();
    let store_for_popups = Arc::clone(store);
    let counter_for_popups = Arc::clone(counter);
    let app_name_for_popups = app_name.clone();

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(base.clone()))
        .title(&loaded.config.name)
        .inner_size(loaded.config.width as f64, loaded.config.height as f64)
        .min_inner_size(320.0, 240.0)
        .center()
        .data_directory(data.to_path_buf())
        .on_navigation({
            let base = base.clone();
            move |target| match navigation_decision(&base, target) {
                NavigationDecision::Allow => true,
                NavigationDecision::External => {
                    let _ = open::that(target.as_str());
                    false
                }
                NavigationDecision::Deny => false,
            }
        })
        .on_new_window(move |url, features| {
            popups::handle(
                &app_for_popups,
                &base_for_popups,
                &data_for_popups,
                &store_for_popups,
                &counter_for_popups,
                &app_name_for_popups,
                url,
                features,
            )
        })
        .on_download(downloads::handler())
        .on_permission_request(permissions::handler(Arc::clone(store), app_name.clone()))
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.eval(script::KEYBOARD);
            }
        });

    builder = builder.icon(icon).map_err(|error| error.to_string())?;
    builder.build().map_err(|error| error.to_string())
}
