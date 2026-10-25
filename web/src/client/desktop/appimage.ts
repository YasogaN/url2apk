import {
  packageBase,
  serializeConfig,
  type DesktopArch,
  type DesktopConfig,
} from "./config";
import { appendPayload } from "./trailer";

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type AppImageVariant = "lite" | "full";

export type AppImageBundle = {
  bytes: Uint8Array;
  filename: string;
  base: string;
};

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function isAppImage(bytes: Uint8Array): boolean {
  return (
    hasMagic(bytes, ELF_MAGIC) &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x49 &&
    bytes[10] === 0x02
  );
}

export function buildAppImage(
  config: DesktopConfig,
  icon: Uint8Array,
  image: Uint8Array,
  arch: DesktopArch,
  variant: AppImageVariant,
): AppImageBundle {
  if (image.length === 0) {
    throw new Error("The AppImage base is empty.");
  }
  if (!isAppImage(image)) {
    throw new Error("The AppImage base is not a type-2 runtime image.");
  }
  if (icon.length === 0) {
    throw new Error("The app icon is empty.");
  }
  if (!hasMagic(icon, PNG_MAGIC)) {
    throw new Error("The app icon is not a PNG image.");
  }

  const base = packageBase(config);
  const suffix = variant === "full" ? "-portable" : "";
  return {
    bytes: appendPayload(image, serializeConfig(config), icon),
    filename: `${base}-${arch}${suffix}.AppImage`,
    base,
  };
}
