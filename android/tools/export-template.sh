#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
./gradlew :app:assembleRelease
cp app/build/outputs/apk/release/app-release-unsigned.apk ../web/public/shell.apk
echo "Wrote ../web/public/shell.apk"
