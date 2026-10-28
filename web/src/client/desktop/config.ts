import { normalizeUrl } from "../domain";

export const DESKTOP_CONFIG_SCHEMA = 1;
export const DESKTOP_NAME_MAX = 64;
export const DESKTOP_DEFAULT_WIDTH = 1200;
export const DESKTOP_DEFAULT_HEIGHT = 780;
export const DESKTOP_MIN_WIDTH = 320;
export const DESKTOP_MAX_WIDTH = 7680;
export const DESKTOP_MIN_HEIGHT = 240;
export const DESKTOP_MAX_HEIGHT = 4320;

export type DesktopPlatform = "windows" | "linux";
export type DesktopArch = "x64" | "arm64";
export type DesktopArtifact =
  | "windows-setup-user"
  | "windows-setup-system"
  | "windows-portable"
  | "linux-tar"
  | "linux-appimage"
  | "linux-flatpak"
  | "linux-flatpak-oci";

export type DesktopConfig = {
  schema: typeof DESKTOP_CONFIG_SCHEMA;
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
};

export type DesktopConfigInput = {
  url: string;
  name: string;
  width?: number;
  height?: number;
};

export type NameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export type DesktopConfigResult =
  | { ok: true; config: DesktopConfig }
  | { ok: false; message: string };

const ALLOWED_NAME = /^[\p{L}\p{M}\p{N} .'_&()-]+$/u;
const HAS_SYMBOL = /[\p{L}\p{N}]/u;
const HAS_EMOJI =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Variation_Selector}]/u;
const HAS_CONTROL = /\p{Cc}/u;

export function normalizeDesktopName(raw: string): NameResult {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name === "") {
    return { ok: false, message: "Give the app a name." };
  }
  if ([...name].length > DESKTOP_NAME_MAX) {
    return {
      ok: false,
      message: `Use ${DESKTOP_NAME_MAX} characters or fewer.`,
    };
  }
  if (HAS_EMOJI.test(name)) {
    return { ok: false, message: "Emojis are not supported in app names." };
  }
  if (HAS_CONTROL.test(name) || !ALLOWED_NAME.test(name)) {
    return {
      ok: false,
      message: "Use letters, numbers, spaces and - _ . ' & ( ) only.",
    };
  }
  if (!HAS_SYMBOL.test(name)) {
    return { ok: false, message: "Use at least one letter or number." };
  }
  return { ok: true, name };
}

export function slugifyName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug === "" ? "app" : slug;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function desktopAppId(url: string, name: string): string {
  return `napp-${fnv1a64(`${url}\n${name}`).slice(0, 12)}`;
}

function dimension(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function buildDesktopConfig(
  input: DesktopConfigInput,
): DesktopConfigResult {
  const target = normalizeUrl(input.url);
  if (!target.ok) {
    return { ok: false, message: target.message };
  }
  const named = normalizeDesktopName(input.name);
  if (!named.ok) {
    return { ok: false, message: named.message };
  }
  const url = target.url.href;
  return {
    ok: true,
    config: {
      schema: DESKTOP_CONFIG_SCHEMA,
      id: desktopAppId(url, named.name),
      url,
      name: named.name,
      width: dimension(
        input.width,
        DESKTOP_DEFAULT_WIDTH,
        DESKTOP_MIN_WIDTH,
        DESKTOP_MAX_WIDTH,
      ),
      height: dimension(
        input.height,
        DESKTOP_DEFAULT_HEIGHT,
        DESKTOP_MIN_HEIGHT,
        DESKTOP_MAX_HEIGHT,
      ),
    },
  };
}

export function serializeConfig(config: DesktopConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(config));
}

export function packageBase(config: DesktopConfig): string {
  return `${slugifyName(config.name)}-${config.id.slice(-6)}`;
}
