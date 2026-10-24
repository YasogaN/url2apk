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
 * example.com -> com.example, www.example.com -> com.example.www.
 */
export function packageName(url: URL): string {
  const labels = url.hostname
    .toLowerCase()
    .replace(/\.+$/, "")
    .split(".")
    .filter((label) => label !== "")
    .map(sanitizeLabel)
    .reverse();
  const joined = labels.join(".");
  const withRoot = joined.includes(".") ? joined : `app.${joined}`;
  if (withRoot.length <= PACKAGE_MAX_LENGTH) {
    return withRoot;
  }
  return withRoot
    .slice(0, PACKAGE_MAX_LENGTH)
    .replace(/[._]+$/, "");
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
