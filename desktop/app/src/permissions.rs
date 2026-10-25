use std::sync::Arc;

use tauri::webview::{PermissionKind, PermissionResponse};
use url2app_shell_core::{Permission, PermissionStore};

fn permission(kind: PermissionKind) -> Option<Permission> {
    match kind {
        PermissionKind::Camera => Some(Permission::Camera),
        PermissionKind::Microphone => Some(Permission::Microphone),
        PermissionKind::Geolocation => Some(Permission::Geolocation),
        PermissionKind::Notifications => Some(Permission::Notifications),
        PermissionKind::ClipboardRead => Some(Permission::ClipboardRead),
        _ => None,
    }
}

pub fn handler(
    store: Arc<PermissionStore>,
    app_name: String,
) -> impl Fn(tauri::Webview, PermissionKind) -> PermissionResponse + Send + Sync + 'static {
    move |_webview, kind| {
        let Some(permission) = permission(kind) else {
            return PermissionResponse::Default;
        };
        #[cfg(target_os = "linux")]
        {
            let allowed = store.decide(permission, |permission| {
                matches!(
                    rfd::MessageDialog::new()
                        .set_title("Permission")
                        .set_description(format!(
                            "{app_name} wants to use your {}.",
                            permission.label()
                        ))
                        .set_buttons(rfd::MessageButtons::YesNo)
                        .show(),
                    rfd::MessageDialogResult::Yes
                )
            });
            if allowed {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (&store, &app_name, permission);
            PermissionResponse::Default
        }
    }
}
