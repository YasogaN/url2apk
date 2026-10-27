import { parseTarget } from "../worker/target";

export function normalizeUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; message: string } {
  return parseTarget(raw.trim());
}

export function suggestName(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) {
    return host;
  }
  const labels = host
    .split(".")
    .filter(
      (label) =>
        label !== "" && label !== "www" && label !== "m" && label !== "mobile",
    );
  if (labels.length === 0) {
    return host;
  }
  return titleCase(labels[0].replace(/[-_]+/g, " "));
}

export function initials(name: string): string {
  for (const character of name) {
    if (/[a-z0-9]/i.test(character)) {
      return character.toUpperCase();
    }
  }
  return "•";
}

const PACKAGE_MAX_LENGTH = 127;

const KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "non_sealed",
  "null",
  "package",
  "permits",
  "private",
  "protected",
  "public",
  "record",
  "return",
  "sealed",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "var",
  "void",
  "volatile",
  "while",
  "yield",
]);

/**
 * Reverse-domain package derived from the page host:
 * example.com -> com.example, www.example.com -> com.example.
 */
export function packageName(url: URL): string {
  let labels = url.hostname
    .toLowerCase()
    .replace(/\.+$/, "")
    .split(".")
    .filter((label) => label !== "");
  if (labels.length >= 3 && labels[0] === "www") {
    labels = labels.slice(1);
  }
  labels = labels.map(sanitizeLabel).reverse();
  const joined = labels.join(".");
  const withRoot = joined.includes(".") ? joined : `app.${joined}`;
  if (withRoot.length <= PACKAGE_MAX_LENGTH) {
    return withRoot;
  }
  return withRoot
    .slice(0, PACKAGE_MAX_LENGTH)
    .replace(/[._]+$/, "");
}

const FLATPAK_ID_MAX = 80;

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Flatpak app ID derived from the wrapped host, mirroring the Android package
 * name. Flatpak requires at least three dot-separated components, so a
 * two-component package gets the `app.` prefix. The 80-character cap keeps
 * the generated desktop and icon file names inside the ustar name field; a
 * host hash keeps long IDs distinct.
 */
export function flatpakAppId(url: URL): string {
  const base = packageName(url);
  const id = base.split(".").length >= 3 ? base : `app.${base}`;
  if (id.length <= FLATPAK_ID_MAX) {
    return id;
  }
  const labels = id.split(".");
  const suffix = `a${fnv1a64(url.hostname).slice(0, 8)}`;
  const maxPrefix = FLATPAK_ID_MAX - suffix.length - 1;
  let prefix = labels.slice(0, 3).join(".").slice(0, maxPrefix);
  prefix = prefix.replace(/[._-]+$/, "");
  if (prefix.split(".").length < 3) {
    prefix = `app.${labels[0].slice(0, 20)}`;
  }
  return `${prefix}.${suffix}`;
}

function sanitizeLabel(value: string): string {
  let label = value
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  if (label === "") {
    return "site";
  }
  if (/^[0-9]/.test(label)) {
    label = `a${label}`;
  }
  if (KEYWORDS.has(label)) {
    label = `${label}_`;
  }
  return label;
}

export function formatVersionCode(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(2_100_000_000, Math.max(1, Math.trunc(value)));
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
