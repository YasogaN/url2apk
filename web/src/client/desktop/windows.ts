import {
  packageBase,
  serializeConfig,
  type DesktopArch,
  type DesktopConfig,
} from "./config";
import { createZip, type ZipEntry } from "./zip";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const encoder = new TextEncoder();

export type WindowsBundle = {
  archive: Uint8Array;
  filename: string;
  base: string;
};

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function isPe(bytes: Uint8Array): boolean {
  if (bytes.length < 64) {
    return false;
  }
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(0x3c, true);
  if (offset + 4 > bytes.length) {
    return false;
  }
  return (
    bytes[offset] === 0x50 &&
    bytes[offset + 1] === 0x45 &&
    bytes[offset + 2] === 0 &&
    bytes[offset + 3] === 0
  );
}

export function windowsReadmeText(
  config: DesktopConfig,
  base: string,
): string {
  return [
    config.name,
    "",
    `URL: ${config.url}`,
    "",
    "Run:",
    `  ${base}.exe`,
    "",
    "Windows may show a SmartScreen warning because this build is unsigned.",
    "It loads the live site and does not auto-update.",
    "",
  ].join("\n");
}

export function buildWindowsPortable(
  config: DesktopConfig,
  icon: Uint8Array,
  shell: Uint8Array,
  arch: DesktopArch,
): WindowsBundle {
  if (shell.length === 0) {
    throw new Error("The Windows shell is empty.");
  }
  if (!isPe(shell)) {
    throw new Error("The Windows shell is not a PE binary.");
  }
  if (icon.length === 0) {
    throw new Error("The app icon is empty.");
  }
  if (!hasMagic(icon, PNG_MAGIC)) {
    throw new Error("The app icon is not a PNG image.");
  }

  const base = packageBase(config);
  const entries: ZipEntry[] = [
    { name: `${base}/`, directory: true, mode: 0o755 },
    { name: `${base}/${base}.exe`, data: shell },
    { name: `${base}/config.json`, data: serializeConfig(config) },
    { name: `${base}/icon.png`, data: icon },
    {
      name: `${base}/README.txt`,
      data: encoder.encode(windowsReadmeText(config, base)),
    },
  ];
  return {
    archive: createZip(entries),
    filename: `${base}-${arch}.zip`,
    base,
  };
}
