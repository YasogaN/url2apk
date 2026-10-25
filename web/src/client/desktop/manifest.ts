import { bufferSource } from "../apk/bytes";
import type { DesktopArch, DesktopArtifact } from "./config";

export const MANIFEST_URL = "/shells.json";
export const CONFIRMATION_THRESHOLD = 25 * 1024 * 1024;
const CACHE_NAME = "url2app-shells-v1";

export type BaseFile = {
  url: string;
  size: number;
  sha256: string;
};

export type ShellArtifacts = Partial<
  Record<DesktopArtifact, Partial<Record<DesktopArch, BaseFile>>>
>;

export type ShellManifest = {
  version: string;
  artifacts: ShellArtifacts;
};

export type BaseCache = {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
};

export type FetchBaseOptions = {
  fetch?: typeof fetch;
  cache?: BaseCache | null;
};

const ARTIFACTS: DesktopArtifact[] = [
  "windows-setup",
  "windows-portable",
  "linux-tar",
  "linux-appimage",
  "linux-appimage-full",
];
const ARCHES: DesktopArch[] = ["x64", "arm64"];

function invalidManifest(): Error {
  return new Error("The shell manifest is not valid.");
}

function parseBaseFile(value: unknown): BaseFile {
  if (typeof value !== "object" || value === null) {
    throw invalidManifest();
  }
  const record = value as Record<string, unknown>;
  const { url, size, sha256 } = record;
  if (typeof url !== "string" || url === "") {
    throw invalidManifest();
  }
  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    throw invalidManifest();
  }
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw invalidManifest();
  }
  return { url, size, sha256 };
}

export function parseManifest(value: unknown): ShellManifest {
  if (typeof value !== "object" || value === null) {
    throw invalidManifest();
  }
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "string" || record.version === "") {
    throw invalidManifest();
  }
  if (typeof record.artifacts !== "object" || record.artifacts === null) {
    throw invalidManifest();
  }

  const artifacts: ShellArtifacts = {};
  for (const artifact of ARTIFACTS) {
    const raw = (record.artifacts as Record<string, unknown>)[artifact];
    if (raw === undefined) {
      continue;
    }
    if (typeof raw !== "object" || raw === null) {
      throw invalidManifest();
    }
    const perArch: Partial<Record<DesktopArch, BaseFile>> = {};
    for (const arch of ARCHES) {
      const rawFile = (raw as Record<string, unknown>)[arch];
      if (rawFile === undefined) {
        continue;
      }
      perArch[arch] = parseBaseFile(rawFile);
    }
    artifacts[artifact] = perArch;
  }
  return { version: record.version, artifacts };
}

export async function loadManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<ShellManifest> {
  const response = await fetchImpl(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("The shell manifest could not be loaded.");
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The shell manifest is not valid JSON.");
  }
  return parseManifest(value);
}

export function findBase(
  manifest: ShellManifest,
  artifact: DesktopArtifact,
  arch: DesktopArch,
): BaseFile {
  const file = manifest.artifacts[artifact]?.[arch];
  if (file === undefined) {
    throw new Error("That build target is not available yet.");
  }
  return file;
}

export function needsConfirmation(base: BaseFile): boolean {
  return base.size > CONFIRMATION_THRESHOLD;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function matches(bytes: Uint8Array, base: BaseFile): Promise<boolean> {
  return bytes.length === base.size && (await sha256Hex(bytes)) === base.sha256;
}

async function openCache(): Promise<BaseCache | undefined> {
  if (typeof caches === "undefined") {
    return undefined;
  }
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

async function readCached(
  cache: BaseCache,
  base: BaseFile,
): Promise<Uint8Array | undefined> {
  let cached: Response | undefined;
  try {
    cached = await cache.match(base.url);
  } catch {
    return undefined;
  }
  if (cached === undefined) {
    return undefined;
  }
  const bytes = new Uint8Array(await cached.arrayBuffer());
  if (await matches(bytes, base)) {
    return bytes;
  }
  try {
    await cache.delete(base.url);
  } catch {
    // A stale cache entry should not block the build.
  }
  return undefined;
}

export async function fetchBase(
  base: BaseFile,
  options: FetchBaseOptions = {},
): Promise<Uint8Array> {
  const cache =
    options.cache === null
      ? undefined
      : (options.cache ?? (await openCache()));
  const cached =
    cache === undefined ? undefined : await readCached(cache, base);
  if (cached !== undefined) {
    return cached;
  }

  const response = await (options.fetch ?? fetch)(base.url, {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error("The shell download failed.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!(await matches(bytes, base))) {
    throw new Error("The shell download failed its integrity check.");
  }
  if (cache !== undefined) {
    try {
      await cache.put(
        base.url,
        new Response(bufferSource(bytes), {
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    } catch {
      // A cache write failure should not block the build.
    }
  }
  return bytes;
}
