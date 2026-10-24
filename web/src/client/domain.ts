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

export async function packageName(url: URL, seed: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${url.href}\n${seed}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `com.urltoapk.a${hex.slice(0, 20)}`;
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
