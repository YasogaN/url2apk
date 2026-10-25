use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Permission {
    Camera,
    Microphone,
    Geolocation,
    Notifications,
    ClipboardRead,
}

impl Permission {
    pub const ALL: [Permission; 5] = [
        Permission::Camera,
        Permission::Microphone,
        Permission::Geolocation,
        Permission::Notifications,
        Permission::ClipboardRead,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Permission::Camera => "camera",
            Permission::Microphone => "microphone",
            Permission::Geolocation => "geolocation",
            Permission::Notifications => "notifications",
            Permission::ClipboardRead => "clipboard-read",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Permission::Camera => "camera",
            Permission::Microphone => "microphone",
            Permission::Geolocation => "location",
            Permission::Notifications => "notifications",
            Permission::ClipboardRead => "clipboard",
        }
    }
}

#[derive(Debug)]
pub struct PermissionStore {
    path: PathBuf,
    decisions: Mutex<HashMap<String, bool>>,
}

impl PermissionStore {
    pub fn load(path: PathBuf) -> Self {
        let decisions = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            decisions: Mutex::new(decisions),
        }
    }

    pub fn get(&self, permission: Permission) -> Option<bool> {
        let decisions = self
            .decisions
            .lock()
            .expect("permission store mutex poisoned");
        decisions.get(permission.key()).copied()
    }

    pub fn set(&self, permission: Permission, allowed: bool) {
        let mut decisions = self
            .decisions
            .lock()
            .expect("permission store mutex poisoned");
        decisions.insert(permission.key().to_string(), allowed);
        let bytes =
            serde_json::to_vec_pretty(&*decisions).expect("permission store serialization failed");
        let _ = fs::write(&self.path, bytes);
    }

    pub fn decide<F: FnOnce(Permission) -> bool>(&self, permission: Permission, prompt: F) -> bool {
        if let Some(allowed) = self.get(permission) {
            return allowed;
        }
        let allowed = prompt(permission);
        self.set(permission, allowed);
        allowed
    }
}
