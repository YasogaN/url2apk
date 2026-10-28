# Contributing

## Before you start

Check the existing issues and pull requests before starting a large change. For a security issue, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development

The commands live in the [README](README.md#self-host). The short version:

```sh
cd web
pnpm install
pnpm dev
pnpm typecheck
pnpm test:coverage
pnpm build
```

The Android and desktop shells have their own requirements and test commands in the README. `web/public/shell.apk` is generated, not committed; run `android/tools/export-template.sh` before a local web build or test run. The release moves that template into `web/public/shells/<sha>/shell.apk` and lists it under `android` in `shells.json`.

## Tests and coverage

The web source is under a 100% statements/branches/functions/lines gate. The Android and desktop jobs have their own coverage gates. Add tests with the change rather than in a follow-up pull request.

## Commits

Use Conventional Commits and keep each commit to one concern. Small, atomic commits are easier to review and revert. Do not mix formatting, refactoring and behavior changes in one commit.

## Pull requests

Describe what changed, why it changed, and how it was verified. Include the commands you ran and any platform-specific checks. If the change touches a generated artifact or a release workflow, say so explicitly.

## Code of conduct

Be direct, stay on the technical problem, and assume good faith. Harassment and personal attacks are not welcome.
