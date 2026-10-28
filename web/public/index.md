# URL to App

> A URL in. An Android, Windows or Linux app out.

URL to App is a local-first tool that packages an HTTPS website as a small Android WebView APK, an unsigned Windows desktop app, or a Linux Flatpak, AppImage or tarball. It runs entirely in the browser: the package is assembled in the tab, with no account and no cloud build.

## What you get

- **Android:** a launcher icon, app-drawer entry and its own window. Uploads, downloads, camera, microphone, geolocation and fullscreen video. A local key and a locally signed APK.
- **Windows:** a per-app `Setup.exe` with per-user or system-wide install, and a portable `.zip`. One app per site, with its own shortcut, window title and isolated WebView2 profile.
- **Linux:** a Flatpak, a system-WebKit AppImage and a `.tar.gz`, with x86_64 and aarch64 builds. The Flatpak shares the GNOME runtime, so WebKitGTK security updates come with the runtime.
- **Every target:** the URL, name and icon are data. The shell is built once and reused, so no per-site compiler run.

## What it is not

- Not a browser. It is a WebView wrapper around the live URL; there is no offline copy.
- Google sign-in fails in embedded WebViews.
- No Web Push, browser extensions or Firefox profile on Android.
- No App Links or domain capture; links to the site still open in the default browser.
- DRM L1 and passkeys are limited, and some sites block WebView.
- Windows builds are unsigned and will show SmartScreen warnings. They do not update themselves.
- Flatpak bundles need Flatpak 1.18+ and the GNOME 50 runtime. The system-WebKit AppImage still needs FUSE; `--appimage-extract-and-run` and the tarball are the fallbacks.
- macOS is not supported yet.

## How it compares

URL to App started with Android: a locally signed WebView APK built in the tab, without a cloud build. The same prebuilt-shell model extends to Windows and Linux, including a Flatpak that shares the GNOME runtime. PWABuilder and Bubblewrap still make sense when you need a Trusted Web Activity or a Play Store pipeline. Desktop wrappers such as Tauri CLI and Electron Forge compile a new binary per site; URL to App treats the URL, name, icon and size as data.

## How it works

1. A prebuilt shell per platform: a Kotlin WebView shell for Android and a Tauri v2 shell for Windows and Linux. The Linux Flatpak uses the shared GNOME runtime.
2. Data, not compilation: fixed template slots or a sidecar `config.json` carry the URL, name, icon and desktop window size.
3. The browser patches the shell, renders the icon and signs Android APKs locally.
4. Shell binaries and installers are built once in CI and fetched on demand.

## Privacy

No accounts, analytics, telemetry or third-party scripts. The only third-party request is the optional favicon lookup through this deployment's `/api/favicon` endpoint. Desktop builds download their prebuilt shell from this deployment and nothing else.

## Guides

- [Website to Android APK without a cloud build](https://url2app.yasogan.dev/website-to-apk)
- [Website to Windows or Linux desktop app](https://url2app.yasogan.dev/website-to-desktop-app)
- [URL to App vs PWABuilder and Bubblewrap](https://url2app.yasogan.dev/pwabuilder-alternative)
- [How local APK signing works](https://url2app.yasogan.dev/apk-signing)

## Links

- [Open the builder](https://url2app.yasogan.dev/)
- [Source code](https://github.com/YasogaN/url2app)
- [llms.txt](https://url2app.yasogan.dev/llms.txt)
- [AI catalog](https://url2app.yasogan.dev/.well-known/ai-catalog.json)
- [Sitemap](https://url2app.yasogan.dev/sitemap.xml)
