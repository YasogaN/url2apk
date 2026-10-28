#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown --lib
mkdir -p ../../public/wasm
wasm-bindgen target/wasm32-unknown-unknown/release/url2app_flatpak_bundle.wasm \
  --out-dir ../../public/wasm --target web
