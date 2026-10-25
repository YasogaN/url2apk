import { bufferSource } from "./apk/bytes";

export const SHELL_CACHE_NAME = "url2app-shells-v1";
export const SHELL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SHELL_CACHED_AT_HEADER = "x-url2app-cached-at";

export type ShellCache = {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
};

export type CachedShell = {
  bytes: Uint8Array;
  cachedAt: number;
};

export type LoadShellOptions = {
  fetch?: typeof fetch;
  cache?: ShellCache | null;
  now?: () => number;
  maxAgeMs?: number;
  message?: string;
};

export async function openShellCache(): Promise<ShellCache | undefined> {
  if (typeof caches === "undefined") {
    return undefined;
  }
  try {
    return await caches.open(SHELL_CACHE_NAME);
  } catch {
    return undefined;
  }
}

export async function readShellCache(
  cache: ShellCache,
  url: string,
): Promise<CachedShell | undefined> {
  let response: Response | undefined;
  try {
    response = await cache.match(url);
  } catch {
    return undefined;
  }
  if (response === undefined) {
    return undefined;
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const header = response.headers.get(SHELL_CACHED_AT_HEADER);
    const cachedAt = header === null ? 0 : Number(header);
    return {
      bytes,
      cachedAt: Number.isFinite(cachedAt) ? cachedAt : 0,
    };
  } catch {
    return undefined;
  }
}

export async function writeShellCache(
  cache: ShellCache,
  url: string,
  bytes: Uint8Array,
  cachedAt: number = Date.now(),
): Promise<void> {
  try {
    await cache.put(
      url,
      new Response(bufferSource(bytes), {
        headers: {
          "content-type": "application/octet-stream",
          [SHELL_CACHED_AT_HEADER]: String(cachedAt),
        },
      }),
    );
  } catch {
    // A cache write failure should not block the build.
  }
}

export async function loadShell(
  url: string,
  options: LoadShellOptions = {},
): Promise<Uint8Array> {
  const cache =
    options.cache === null
      ? undefined
      : (options.cache ?? (await openShellCache()));
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? SHELL_MAX_AGE_MS;
  const cached =
    cache === undefined ? undefined : await readShellCache(cache, url);
  if (cached !== undefined && now() - cached.cachedAt < maxAgeMs) {
    return cached.bytes;
  }

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(options.message ?? "The shell could not be loaded.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (cache !== undefined) {
      await writeShellCache(cache, url, bytes, now());
    }
    return bytes;
  } catch (error) {
    if (cached !== undefined) {
      return cached.bytes;
    }
    throw error;
  }
}
