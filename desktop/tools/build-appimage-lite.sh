#!/usr/bin/env sh
set -eu
if [ "$#" -ne 5 ]; then
  echo "usage: $0 <arch> <shell> <icon.png> <runtime> <output.AppImage>" >&2
  exit 2
fi
arch="$1"
shell="$(realpath "$2")"
icon="$(realpath "$3")"
runtime="$(realpath "$4")"
output="$(realpath -m "$5")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
appdir="$tmp/AppDir"

mkdir -p "$appdir/usr/bin" "$appdir/usr/share/applications" "$appdir/usr/share/icons/hicolor/256x256/apps"
cp "$shell" "$appdir/usr/bin/shell"
chmod 755 "$appdir/usr/bin/shell"
cp "$icon" "$appdir/url2app-shell.png"
cp "$icon" "$appdir/usr/share/icons/hicolor/256x256/apps/url2app-shell.png"
ln -s url2app-shell.png "$appdir/.DirIcon"

cat > "$appdir/AppRun" <<'APPRUN'
#!/bin/sh
set -eu
here="$(dirname "$(readlink -f "$0")")"
exec "$here/usr/bin/shell" "$@"
APPRUN
chmod 755 "$appdir/AppRun"

cat > "$appdir/url2app-shell.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=URL to App Shell
Comment=URL to App
Exec=shell
Icon=url2app-shell
Terminal=false
Categories=Utility;
StartupWMClass=shell
DESKTOP
cp "$appdir/url2app-shell.desktop" "$appdir/usr/share/applications/url2app-shell.desktop"

squashfs="$tmp/payload.squashfs"
mksquashfs "$appdir" "$squashfs" -noappend -all-root -comp gzip -quiet
cat "$runtime" "$squashfs" > "$output"
chmod 755 "$output"

offset="$("$output" --appimage-offset)"
runtime_size="$(stat -c%s "$runtime")"
if [ "$offset" != "$runtime_size" ]; then
  echo "AppImage offset $offset does not match the runtime size $runtime_size" >&2
  exit 1
fi

echo "Wrote $output ($(stat -c%s "$output") bytes, $arch)"
