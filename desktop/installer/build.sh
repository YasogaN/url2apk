#!/usr/bin/env sh
set -eu
if [ "$#" -ne 4 ]; then
  echo "usage: $0 user|system <shell.exe> <installer-helper.exe> <output.exe>" >&2
  exit 2
fi
scope="$1"
shell="$2"
helper="$3"
output="$4"
case "$scope" in
  user) scope_flag="" ;;
  system) scope_flag="-DSYSTEM_WIDE" ;;
  *) echo "scope must be user or system" >&2; exit 2 ;;
esac
here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
icon="$here/../app/icons/icon.ico"
# shellcheck disable=SC2086
makensis $scope_flag \
  "-DOUTFILE=$output" \
  "-DSHELL=$shell" \
  "-DHELPER=$helper" \
  "-DICON_ICO=$icon" \
  "$here/generic.nsi"
