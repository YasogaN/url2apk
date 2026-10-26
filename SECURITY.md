# Security policy

## Supported versions

The live builder at [url2app.yasogan.dev](https://url2app.yasogan.dev) and the latest tagged release are supported. Older releases may not receive fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting instead of opening a public issue:

https://github.com/YasogaN/url2app/security/advisories/new

Please include the affected component (web builder, Worker favicon proxy, Android shell, desktop shell or release pipeline), the version or commit, reproduction steps, and the impact you believe the issue has. Do not include real signing keys, backup passwords or other secrets in the report.

## What to expect

You will get an acknowledgement when the report is seen. Valid reports are investigated privately, fixed on a branch, and disclosed after a release when practical. Credit is offered unless you ask to remain anonymous.

## Signing keys

URL to App generates Android signing keys in the browser with WebCrypto and imports the private key as non-extractable. The key and its encrypted `.p1x` backup are never uploaded to this deployment. A report about a key leak should say whether it involves the browser code, IndexedDB, the backup format or a local build artifact.

## Scope

In scope:

- The web builder and its packaging pipelines in `web/src/client/`.
- The Cloudflare Worker favicon proxy in `web/src/worker/`.
- The Android shell in `android/` and the desktop shells in `desktop/`.
- The release workflow and published shell assets.

Out of scope:

- Vulnerabilities in a third-party site that a user chooses to wrap.
- Android or desktop OS behavior after the generated app is installed.
- Reports that require the user to install an untrusted app or disable platform security.
- Denial of service against the favicon proxy that only requires normal public traffic.
