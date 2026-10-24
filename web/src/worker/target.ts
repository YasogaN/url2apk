export type TargetResult =
  | { ok: true; url: URL }
  | { ok: false; message: string };

const V4_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function ipv4ToInt(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function inBlock(ip: number, base: number, bits: number): boolean {
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isPrivateV4(ip: number): boolean {
  for (const [base, bits] of V4_BLOCKS) {
    if (inBlock(ip, base, bits)) {
      return true;
    }
  }
  return false;
}

function isPrivateV6(host: string): boolean {
  if (host === "::" || host === "::1") {
    return true;
  }
  if (host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  if (/^fe[89ab]/.test(host)) {
    return true;
  }
  if (host.startsWith("ff")) {
    return true;
  }
  if (host.startsWith("::ffff:")) {
    const mapped = ipv4ToInt(host.slice("::ffff:".length));
    return mapped === null || isPrivateV4(mapped);
  }
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) {
    return true;
  }
  if (/^[0-9.]+$/.test(host)) {
    const ip = ipv4ToInt(host);
    return ip === null || isPrivateV4(ip);
  }
  if (host.includes(":")) {
    return isPrivateV6(host);
  }
  return false;
}

export function parseTarget(raw: string): TargetResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "Enter a valid https URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "Only https URLs are supported." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, message: "URLs with credentials are not supported." };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, message: "Private and local hosts are not supported." };
  }
  return { ok: true, url };
}
