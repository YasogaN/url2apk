use std::fs;
use url2app_shell_core::permissions::*;

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
    let mut refusal = |_: Permission| {
        calls += 1;
        false
    };
    assert!(!refusal(Permission::Camera));
    assert!(store.decide(Permission::Camera, refusal));
    assert_eq!(calls, 2);
    assert_eq!(store.get(Permission::Camera), Some(true));
}

#[test]
fn persists_a_denial() {
    let dir = tempdir().unwrap();
    let store = PermissionStore::load(dir.path().join("permissions.json"));
    assert!(!store.decide(Permission::Microphone, |_| false));
    assert_eq!(store.get(Permission::Microphone), Some(false));
}
