import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";
import type { DesktopConfig } from "./config";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const DEFAULT_LANGUAGE = { lang: 1033, codepage: 1200 };

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function pngDimensions(icon: Uint8Array): { width: number; height: number } {
  if (!hasMagic(icon, PNG_MAGIC) || icon.length < 24) {
    throw new Error("The app icon is not a PNG image.");
  }
  const view = new DataView(icon.buffer, icon.byteOffset, icon.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) {
    throw new Error("The app icon has invalid dimensions.");
  }
  return { width, height };
}

export function patchWindowsExe(
  shell: Uint8Array,
  config: DesktopConfig,
  icon: Uint8Array,
): Uint8Array {
  if (shell.length === 0) {
    throw new Error("The Windows shell is empty.");
  }
  const { width, height } = pngDimensions(icon);
  const exe = NtExecutable.from(shell, { ignoreCert: true });
  const resources = NtExecutableResource.from(exe);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (groups.length === 0) {
    throw new Error("The Windows shell has no icon resource.");
  }
  const rawIcon = new Data.RawIconItem(icon, width, height, 32);
  for (const group of groups) {
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      group.id,
      group.lang,
      [rawIcon],
    );
  }

  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  if (versions.length === 0) {
    throw new Error("The Windows shell has no version resource.");
  }
  const strings = {
    FileDescription: config.name,
    ProductName: config.name,
  };
  for (const version of versions) {
    const languages = version.getAllLanguagesForStringValues();
    const targets =
      languages.length === 0 ? [DEFAULT_LANGUAGE] : languages;
    for (const language of targets) {
      version.setStringValues(language, strings);
    }
    version.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  return new Uint8Array(exe.generate());
}
