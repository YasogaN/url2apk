#!/usr/bin/env sh
set -eu
if [ "$#" -ne 4 ]; then
  echo "usage: $0 <arch> <shell> <icon.png> <output.tar>" >&2
  exit 2
fi
arch="$1"
shell="$(realpath "$2")"
icon="$(realpath "$3")"
output="$(realpath -m "$4")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

case "$arch" in
  x64) flatpak_arch=x86_64 ;;
  arm64) flatpak_arch=aarch64 ;;
  *) echo "unsupported arch: $arch" >&2; exit 2 ;;
esac

app_id=dev.yasogan.url2app.base
runtime="org.gnome.Platform/$flatpak_arch/50"
appdir="$tmp/app"
repo="$tmp/repo"
oci="$tmp/oci"

mkdir -p "$appdir/files/bin" "$appdir/files/share/applications" \
  "$appdir/files/share/icons/hicolor/256x256/apps"
cp "$shell" "$appdir/files/bin/url2app-shell"
chmod 755 "$appdir/files/bin/url2app-shell"
cp "$icon" "$appdir/files/share/icons/hicolor/256x256/apps/$app_id.png"

cat > "$appdir/files/share/applications/$app_id.desktop" <<DESKTOP
[Desktop Entry]
Name=URL to App
Exec=url2app-shell
Type=Application
Icon=$app_id
Categories=Utility;
StartupWMClass=url2app-shell
DESKTOP

cat > "$appdir/metadata" <<METADATA
[Application]
name=$app_id
runtime=$runtime
command=url2app-shell
METADATA

flatpak build-finish "$appdir" \
  --command=url2app-shell \
  --share=network \
  --share=ipc \
  --socket=wayland \
  --socket=fallback-x11 \
  --socket=pulseaudio \
  --device=dri \
  --filesystem=xdg-download \
  --talk-name=org.freedesktop.Notifications
flatpak build-export "$repo" "$appdir"
flatpak build-bundle --oci "$repo" "$oci" "$app_id"

mkdir -p "$(dirname "$output")"
tar -C "$oci" -cf "$output" .
echo "Wrote $output"
