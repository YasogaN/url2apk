#!/usr/bin/env sh
set -eu
if [ "$#" -ne 3 ]; then
  echo "usage: $0 <source.AppImage> <runtime> <output.AppImage>" >&2
  exit 2
fi
source="$(realpath "$1")"
runtime="$(realpath "$2")"
output="$(realpath -m "$3")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
chmod 755 "$source"
(
  cd "$tmp"
  "$source" --appimage-extract >/dev/null
)
appdir="$tmp/squashfs-root"
if [ ! -x "$appdir/AppRun" ]; then
  echo "The source AppImage did not contain an AppRun" >&2
  exit 1
fi

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

echo "Wrote $output ($(stat -c%s "$output") bytes)"
