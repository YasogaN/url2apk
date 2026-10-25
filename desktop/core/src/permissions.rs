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
        self.decisions
            .lock()
            .ok()?
            .get(permission.key())
            .copied()
    }

    pub fn set(&self, permission: Permission, allowed: bool) {
        if let Ok(mut decisions) = self.decisions.lock() {
            decisions.insert(permission.key().to_string(), allowed);
            if let Ok(bytes) = serde_json::to_vec_pretty(&*decisions) {
                let _ = fs::write(&self.path, bytes);
            }
        }
    }

    pub fn decide<F: FnOnce(Permission) -> bool>(
        &self,
        permission: Permission,
        prompt: F,
    ) -> bool {
        if let Some(allowed) = self.get(permission) {
            return allowed;
        }
        let allowed = prompt(permission);
        self.set(permission, allowed);
        allowed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn exposes_stable_keys_and_labels() {
        for permission in Permission::ALL {
            assert!(!permission.key().is_empty());
            assert!(!permission.label().is_empty());
        }
        assert_eq!(Permission::Camera.key(), "camera");
        assert_eq!(Permission::Microphone.key(), "microphone");
        assert_eq!(Permission::Geolocation.key(), "geolocation");
        assert_eq!(Permission::Notifications.key(), "notifications");
        assert_eq!(Permission::ClipboardRead.key(), "clipboard-read");
    }

    #[test]
    fn persists_decisions() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("permissions.json");
        let store = PermissionStore::load(path.clone());
        assert_eq!(store.get(Permission::Camera), None);
        store.set(Permission::Camera, true);
        store.set(Permission::Microphone, false);
        assert_eq!(store.get(Permission::Camera), Some(true));
        assert_eq!(store.get(Permission::Microphone), Some(false));

        let reloaded = PermissionStore::load(path);
        assert_eq!(reloaded.get(Permission::Camera), Some(true));
        assert_eq!(reloaded.get(Permission::Microphone), Some(false));
    }

    #[test]
    fn starts_empty_for_missing_or_corrupt_files() {
        let dir = tempdir().unwrap();
        let missing = PermissionStore::load(dir.path().join("missing.json"));
        assert_eq!(missing.get(Permission::Camera), None);

        let corrupt_path = dir.path().join("corrupt.json");
        fs::write(&corrupt_path, b"not json").unwrap();
        let corrupt = PermissionStore::load(corrupt_path);
        assert_eq!(corrupt.get(Permission::Camera), None);
    }

    #[test]
    fn prompts_once_per_permission() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("permissions.json");
        let store = PermissionStore::load(path);
        let mut calls = 0;
        let first = store.decide(Permission::Camera, |permission| {
            calls += 1;
            assert_eq!(permission, Permission::Camera);
            true
        });
        assert!(first);
        assert_eq!(calls, 1);
        assert!(store.decide(Permission::Camera, |_| {
            calls += 1;
            false
        }));
        assert_eq!(calls, 1);
        assert_eq!(store.get(Permission::Camera), Some(true));
    }

    #[test]
    fn persists_a_denial() {
        let dir = tempdir().unwrap();
        let store = PermissionStore::load(dir.path().join("permissions.json"));
        assert!(!store.decide(Permission::Microphone, |_| false));
        assert_eq!(store.get(Permission::Microphone), Some(false));
    }
}
