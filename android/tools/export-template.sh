#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
output="${1:-../web/public/shell.apk}"
./gradlew :app:assembleRelease
mkdir -p "$(dirname "$output")"
cp app/build/outputs/apk/release/app-release-unsigned.apk "$output"
echo "Wrote $output"
