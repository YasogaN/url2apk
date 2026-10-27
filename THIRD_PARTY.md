# Third-party notices

This project is Apache-2.0. It depends on the following projects, whose licences remain their own. The exact versions are pinned in the Gradle build files, `web/pnpm-lock.yaml`, and `desktop/Cargo.lock`.

## Android shell and tests

| Project | Licence |
| --- | --- |
| Kotlin | Apache-2.0 |
| Android Gradle Plugin, R8, D8 | Apache-2.0 |
| JUnit 4 | Eclipse Public License 1.0 |
| Robolectric | Apache-2.0 |
| Mockito | MIT |

## Web app

| Project | Licence |
| --- | --- |
| Hono | MIT |
| fflate | MIT |
| @peculiar/x509 | MIT |
| reflect-metadata | Apache-2.0 |
| Tailwind CSS | MIT |
| Vite | MIT |
| Vitest | MIT |
| Wrangler | Apache-2.0 / MIT |
| TypeScript | Apache-2.0 |
| IBM Plex Mono | SIL Open Font License 1.1 (see `web/public/fonts/OFL.txt`) |

## Desktop shell and packaging

| Project | Licence |
| --- | --- |
| Tauri, tauri-build, tao, wry | Apache-2.0 OR MIT |
| WebView2 runtime (Windows, system-installed) | Microsoft Edge WebView2 terms |
| serde, serde_json | Apache-2.0 OR MIT |
| thiserror | Apache-2.0 OR MIT |
| url | Apache-2.0 OR MIT |
| dirs | Apache-2.0 OR MIT |
| rfd | MIT |
| open | MIT |
| notify-rust | MIT |
| webkit2gtk bindings | MIT |
| WebKitGTK and GTK (system libraries for the AppImage and tarball; supplied by the GNOME runtime for Flatpak) | LGPL-2.1-or-later |
| windows-sys | Apache-2.0 OR MIT |
| resedit | MIT |
| NSIS | zlib/libpng |
| AppImage type2-runtime | MIT |
| @tauri-apps/cli | Apache-2.0 OR MIT |
| jsdom | MIT |
| backhand (vendored for WASM) | MIT OR Apache-2.0 |
| wasm-bindgen | MIT OR Apache-2.0 |

The tarball and the system-WebKit AppImage use the host WebKitGTK/GTK. The Flatpak uses the WebKitGTK and GTK libraries from the GNOME runtime; the generated bundle contains only the shell and its config.

## Standards and specifications

The APK Signature Scheme v2 implementation follows the public Android Open Source Project `apksig` format documentation and constants. The Android binary XML and `resources.arsc` handling follows the public AOSP resource formats.
