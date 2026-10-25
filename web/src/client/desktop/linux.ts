import {
  packageBase,
  serializeConfig,
  type DesktopArch,
  type DesktopConfig,
} from "./config";
import { gzipTar, type TarEntry } from "./tar";

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const encoder = new TextEncoder();

export type LinuxBundle = {
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

export function desktopEntryText(
  config: DesktopConfig,
  base: string,
): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${config.name}`,
    `Comment=Open ${config.url}`,
    `Exec=${base}`,
    `Icon=${config.id}`,
    "Terminal=false",
    "Categories=Utility;",
    `StartupWMClass=${base}`,
    "",
  ].join("\n");
}

export function readmeText(config: DesktopConfig, base: string): string {
  return [
    config.name,
    "",
    `URL: ${config.url}`,
    "",
    "Run:",
    `  ./${base}`,
    "",
    "Install the desktop entry (optional):",
    `  install -Dm755 ${base} ~/.local/bin/${base}`,
    `  install -Dm644 icon.png ~/.local/share/icons/hicolor/256x256/apps/${config.id}.png`,
    `  install -Dm644 ${config.id}.desktop ~/.local/share/applications/${config.id}.desktop`,
    "  update-desktop-database ~/.local/share/applications",
    "",
    "This build is unsigned and loads the live site. It does not auto-update.",
    "",
  ].join("\n");
}

export function buildLinuxBundle(
  config: DesktopConfig,
  icon: Uint8Array,
  shell: Uint8Array,
  arch: DesktopArch,
): LinuxBundle {
  if (shell.length === 0) {
    throw new Error("The Linux shell is empty.");
  }
  if (!hasMagic(shell, ELF_MAGIC)) {
    throw new Error("The Linux shell is not an ELF binary.");
  }
  if (icon.length === 0) {
    throw new Error("The app icon is empty.");
  }
  if (!hasMagic(icon, PNG_MAGIC)) {
    throw new Error("The app icon is not a PNG image.");
  }

  const base = packageBase(config);
  const entries: TarEntry[] = [
    { name: `${base}/`, directory: true, mode: 0o755 },
    { name: `${base}/${base}`, data: shell, mode: 0o755 },
    { name: `${base}/config.json`, data: serializeConfig(config) },
    { name: `${base}/icon.png`, data: icon },
    {
      name: `${base}/README.txt`,
      data: encoder.encode(readmeText(config, base)),
    },
    {
      name: `${base}/${config.id}.desktop`,
      data: encoder.encode(desktopEntryText(config, base)),
    },
  ];
  return {
    archive: gzipTar(entries),
    filename: `${base}-${arch}.tar.gz`,
    base,
  };
}
