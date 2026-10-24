# URL to APK

A local-first URL → Android APK packager. Paste an HTTPS URL, choose a name and icon, and the browser assembles and signs a small WebView APK. No account, no cloud build, no Chrome.

The only server-side feature is the optional favicon lookup; the template is fetched from this deployment itself. Everything else — binary resource patching, ZIP assembly, key generation and APK v2 signing — happens in the tab.

## Repository layout

| Path | What it is |
| --- | --- |
| `android/` | Kotlin WebView shell. minSdk 24, targetSdk 36, no AndroidX. |
| `web/` | Cloudflare Vite + Hono site, static brutalist UI and the local APK pipeline. |
| `web/public/shell.apk` | Prebuilt **unsigned** release template that the browser patches. |
| `android/tools/export-template.sh` | Rebuilds the release APK and copies it into the web app. |
| `.github/workflows/ci.yml` | Android checks and the web typecheck, coverage gate and build. |

## How it works

1. The shell is a small Kotlin WebView host. It loads `assets/config.json`, applies hardened WebView settings, and implements file uploads, downloads, camera/microphone/geolocation prompts, fullscreen video, safe external links, back navigation and a native error/retry screen.
2. The browser fetches the unsigned template and patches it in memory: the package name, the literal label and `versionCode` in the binary `AndroidManifest.xml`, the package name in `resources.arsc`, every launcher PNG, and `assets/config.json`.
3. The ZIP is rebuilt with `resources.arsc` stored and 4-byte aligned, then signed with APK Signature Scheme v2.
4. The signing key is generated locally with WebCrypto (RSA-2048 by default; the key helper also accepts RSA-4096) and a self-signed certificate. The live private key is imported as non-extractable and stored in IndexedDB. The portable copy is a password-encrypted `.p1x` backup (PBKDF2-SHA256 + AES-GCM).

The template relies on fixed slots rather than aapt2 at runtime: a 127-character package slot, a 128-code-unit label slot and a literal `versionCode`. The browser replaces the package with the reversed host, dropping a leading `www` (`example.com` -> `com.example`, `www.example.com` -> `com.example`, `news.ycombinator.com` -> `com.ycombinator.news`), and the label with the chosen name. The patcher shortens the strings in place, NUL-terminates them, clears the AXML string-pool `SORTED_FLAG`, and AGP resource-name optimization is disabled so the icon paths stay predictable.

## Status

- **Android:** `./gradlew :app:check` passes unit tests, lint and the 100% line-coverage gate (JaCoCo offline instrumentation, so Robolectric tests are counted).
- **Web:** `pnpm test:coverage` passes with 100% statements, branches, functions and lines for the Hono API and the pure front-end domain helpers.
- **APK integration:** a test builds a real APK from the committed template and verifies it with `aapt2`, `zipalign` and `apksigner`.

## Requirements

- JDK 17.
- Android SDK platform 36 and build-tools 36.0.0 (for the shell and for the APK integration test).
- Node 24 and pnpm 12.
- For the browser: a modern browser with WebCrypto, IndexedDB, Canvas and `dialog` support.

## Development

### Android shell

```sh
cd android
./gradlew :app:check          # tests + 100% line gate + lint
./gradlew :app:assembleRelease
```

The release APK is unsigned and uses R8. `android/tools/export-template.sh` builds it and copies it to `web/public/shell.apk`.

### Web app

```sh
cd web
pnpm install
pnpm dev                      # Vite + the Hono worker
pnpm typecheck
pnpm test                     # unit + APK integration tests
pnpm test:coverage            # API/front-end-domain coverage gate
pnpm build
```

`pnpm dev` serves the site at `http://localhost:5173` by default; pass `--port` to change it.

`GET /api/favicon?url=https://example.com/` returns the best icon the site exposes. It accepts public HTTPS URLs only, re-validates every redirect, refuses private and local hosts, caps HTML at 4 MB, manifests at 256 KB and icons at 2 MB, and times out after six seconds.

### Deploy

The web app is a standard Cloudflare Worker with static assets. `pnpm deploy` builds and runs `wrangler deploy`. No secrets, databases or KV namespaces are required.

## The template APK

The template is deliberately a normal Gradle release build, not a hand-patched APK. Its fixed slots are:

- package `com.urltoapk.slot.` followed by 109 `a` characters (127 characters),
- a 128-character `android:label` literal,
- `versionCode="1"` and `versionName="1.0"`,
- the standard adaptive and legacy icon paths under `res/`,
- `assets/config.json`.

The browser replaces those values with the reverse-domain package and the selected label, plus the icons. Resource shrinking stays off, R8 keeps the shell classes, and `android.enableResourceOptimizations=false` keeps filenames stable.

## Signing and updates

Android identifies an app by package name plus signing certificate. To update an installed app you need **the same key** and a **higher version code**.

The first build generates the key, downloads the encrypted `.p1x` backup and stores a non-exportable copy in IndexedDB. Keep the backup. If the browser storage is cleared and the backup is lost, the app can no longer be updated: you would have to uninstall it and lose its data. The backup password is the only thing protecting the `.p1x` file.

There is no QR code for the key. A screenshot of a QR is just a screenshot of a secret.

## What works

- A launcher icon, app-drawer entry and its own window.
- File uploads, downloads, camera, microphone, geolocation and fullscreen video.
- External `mailto:`, `tel:`, maps and app links through the system.
- A local error/retry page when the site is unreachable.
- Multiple generated apps on one device (each has its own package and key).
- Any icon source: a locally generated letter tile, an uploaded image, or a fetched favicon.

## What does not

- **Google sign-in will fail.** Google blocks OAuth in embedded WebViews. Opening it in an external browser logs into that browser, not the wrapper.
- No Web Push, browser extensions or Firefox profile.
- No App Links/domain capture: links to the site from other apps still open in your default browser.
- No offline copy. The APK loads the live URL.
- No DRM L1, and passkeys/WebAuthn support is limited.
- Some sites block WebView user agents or rely on APIs WebView does not expose.
- A wrapper is not a compatibility layer. If the site does not work in Android System WebView, the APK will not fix it.

## Distribution reality

- Android will warn about unknown apps; you must allow installs from your browser or file manager.
- Play Protect may warn or block. Do not publish these wrappers to Google Play; they do not meet the minimum-functionality policy.
- Android 14+ refuses apps targeting an API below 23; this template targets 36.
- Google's developer verification starts on 30 September 2026 in Brazil, Indonesia, Singapore and Thailand for participating stores, and is planned to expand globally in 2027. Unverified sideloads may need ADB or the advanced flow (with a wait). Limited distribution to up to 20 devices is exempt. Plan for ADB for personal builds.
- A different signing key cannot update an installed app.

## Privacy

No accounts, no analytics, no telemetry and no third-party scripts. The URL, icon and name are used in the tab. The only third-party network request is `Fetch favicon`, which goes to this deployment's `/api/favicon` endpoint and then to the site you named.

## Responsible use

Use this for sites you have the right to package. Do not impersonate a brand, wrap a site you do not own for distribution, or use generated APKs to phish or mislead. The tool signs with your key; the project has no signing authority.

## Licence

Apache-2.0. See `LICENSE` and `THIRD_PARTY.md`.
