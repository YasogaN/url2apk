# Vendored backhand

This is `backhand` 0.25.5, vendored only to build the AppImage repacker for
`wasm32-unknown-unknown`.

Upstream: https://github.com/wcampbell0x2a/backhand

The only source change is in `src/v4/unix_string.rs`: the Windows UTF-8
`OsStr` implementation is also used for `target_arch = "wasm32"`, because
the crate otherwise relies on `std::os::unix::ffi` and does not compile for
the browser target. AppImage paths and desktop file names are UTF-8.

Keep this in sync with the pinned upstream version, or replace it when
upstream supports the browser target directly.
