# URL to App

> A URL in. An Android, Windows or Linux app out.

URL to App is a local-first tool that packages an HTTPS website as a small Android WebView APK, an unsigned Windows desktop app, or a Linux AppImage or tarball. It runs entirely in the browser: the package is assembled in the tab, with no account and no cloud build.

## What you get

- **Android:** a launcher icon, app-drawer entry and its own window. Uploads, downloads, camera, microphone, geolocation and fullscreen video. A local key and a locally signed APK.
- **Windows:** a per-app `Setup.exe` with per-user or system-wide install, and a portable `.zip`. One app per site, with its own shortcut, window title and isolated WebView2 profile.
- **Linux:** a `.tar.gz` and an AppImage, with x86_64 and aarch64 builds. The AppImage is offered in a small system-WebKit build and a larger bundled-WebKit build.
- **Every target:** the URL, name and icon are data. The shell is built once and reused, so no per-site compiler run.

## What it is not

- Not a browser. It is a WebView wrapper around the live URL; there is no offline copy.
- Google sign-in fails in embedded WebViews.
- No Web Push, browser extensions or Firefox profile on Android.
- No App Links or domain capture; links to the site still open in the default browser.
- DRM L1 and passkeys are limited, and some sites block WebView.
- Windows builds are unsigned and will show SmartScreen warnings. They do not update themselves.
- Linux AppImages still need FUSE; `--appimage-extract-and-run` and the tarball are the fallbacks.
- macOS is not supported yet.

## How it compares

PWABuilder and Bubblewrap build a Trusted Web Activity and usually need a cloud build or a local toolchain. URL to App patches a prebuilt WebView shell in the browser and signs the APK locally, with no account or server-side build. Desktop wrappers such as Tauri CLI and Electron Forge compile a new binary for every site; URL to App uses a prebuilt shell and treats the URL, name and icon as data.

## How it works

1. A prebuilt shell per platform: a Kotlin WebView shell for Android and a Tauri v2 shell for Windows and Linux.
2. Data, not compilation: fixed template slots or a sidecar `config.json` carry the URL, name and icon.
3. The browser patches the shell, renders the icon and signs Android APKs locally.
4. Shell binaries and installers are built once in CI and fetched on demand.

## Privacy

No accounts, analytics, telemetry or third-party scripts. The only third-party request is the optional favicon lookup through this deployment's `/api/favicon` endpoint. Desktop builds download their prebuilt shell from this deployment and nothing else.

## Links

- [Open the builder](https://url2app.yasogan.dev/)
- [Source code](https://github.com/YasogaN/url2app)
- [llms.txt](https://url2app.yasogan.dev/llms.txt)
- [AI catalog](https://url2app.yasogan.dev/.well-known/ai-catalog.json)
- [Sitemap](https://url2app.yasogan.dev/sitemap.xml)
