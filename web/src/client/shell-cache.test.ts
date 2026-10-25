import { describe, expect, it, vi } from "vitest";
import { bufferSource } from "./apk/bytes";
import {
  SHELL_CACHE_NAME,
  SHELL_CACHED_AT_HEADER,
  SHELL_MAX_AGE_MS,
  loadShell,
  openShellCache,
  readShellCache,
  writeShellCache,
  type ShellCache,
} from "./shell-cache";

type FakeCache = ShellCache & { store: Map<string, Response> };

function fakeCache(overrides: Partial<ShellCache> = {}): FakeCache {
  const store = new Map<string, Response>();
  return {
    store,
    match: overrides.match ?? (async (url) => store.get(url)),
    put:
      overrides.put ??
      (async (url, response) => {
        store.set(url, response);
      }),
  };
}

function seed(
  cache: FakeCache,
  url: string,
  bytes: Uint8Array,
  cachedAt?: number,
): void {
  const headers: Record<string, string> = {};
  if (cachedAt !== undefined) {
    headers[SHELL_CACHED_AT_HEADER] = String(cachedAt);
  }
  cache.store.set(url, new Response(bufferSource(bytes), { headers }));
}

function response(bytes: number[] = [7]): Response {
  return new Response(bufferSource(new Uint8Array(bytes)));
}

describe("openShellCache", () => {
  it("returns undefined without the Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(openShellCache()).resolves.toBeUndefined();
  });

  it("opens the shared shell cache", async () => {
    const cache = fakeCache();
    const open = vi.fn(async () => cache);
    vi.stubGlobal("caches", { open });
    await expect(openShellCache()).resolves.toBe(cache);
    expect(open).toHaveBeenCalledWith(SHELL_CACHE_NAME);
  });

  it("returns undefined when opening fails", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(openShellCache()).resolves.toBeUndefined();
  });
});

describe("readShellCache", () => {
  it("returns undefined for a miss", async () => {
    await expect(readShellCache(fakeCache(), "/shell.apk")).resolves.toBeUndefined();
  });

  it("returns undefined when match fails", async () => {
    const cache = fakeCache({
      match: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    await expect(readShellCache(cache, "/shell.apk")).resolves.toBeUndefined();
  });

  it("returns undefined when the body cannot be read", async () => {
    const cache = fakeCache({
      match: vi.fn(
        async () =>
          ({
            arrayBuffer: async () => {
              throw new Error("broken");
            },
            headers: new Headers(),
          }) as unknown as Response,
      ),
    });
    await expect(readShellCache(cache, "/shell.apk")).resolves.toBeUndefined();
  });

  it("reads a valid entry", async () => {
    const cache = fakeCache();
    seed(cache, "/shell.apk", new Uint8Array([1, 2]), 123);
    await expect(readShellCache(cache, "/shell.apk")).resolves.toEqual({
      bytes: new Uint8Array([1, 2]),
      cachedAt: 123,
    });
  });

  it("treats a missing or invalid timestamp as stale", async () => {
    const cache = fakeCache();
    seed(cache, "/missing", new Uint8Array([1]));
    seed(cache, "/invalid", new Uint8Array([2]), Number.NaN);
    await expect(readShellCache(cache, "/missing")).resolves.toEqual({
      bytes: new Uint8Array([1]),
      cachedAt: 0,
    });
    await expect(readShellCache(cache, "/invalid")).resolves.toEqual({
      bytes: new Uint8Array([2]),
      cachedAt: 0,
    });
  });
});

describe("writeShellCache", () => {
  it("stores the bytes and timestamp", async () => {
    const cache = fakeCache();
    await writeShellCache(cache, "/shell.apk", new Uint8Array([1, 2]), 456);
    const stored = cache.store.get("/shell.apk");
    expect(stored).toBeDefined();
    expect(new Uint8Array(await stored?.arrayBuffer() ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([1, 2]),
    );
    expect(stored?.headers.get(SHELL_CACHED_AT_HEADER)).toBe("456");
  });

  it("defaults the timestamp and ignores a failed write", async () => {
    const cache = fakeCache();
    await writeShellCache(cache, "/shell.apk", new Uint8Array([1]));
    expect(
      Number(cache.store.get("/shell.apk")?.headers.get(SHELL_CACHED_AT_HEADER)),
    ).toBeGreaterThan(0);

    const failing = fakeCache({
      put: vi.fn(async () => {
        throw new Error("quota");
      }),
    });
    await expect(
      writeShellCache(failing, "/shell.apk", new Uint8Array([1]), 1),
    ).resolves.toBeUndefined();
  });
});

describe("loadShell", () => {
  it("uses a fresh cached shell without fetching", async () => {
    const cache = fakeCache();
    seed(cache, "/shell.apk", new Uint8Array([1]), 1000);
    const fetchImpl = vi.fn();
    await expect(
      loadShell("/shell.apk", {
        cache,
        fetch: fetchImpl as unknown as typeof fetch,
        now: () => 1000,
        maxAgeMs: 10,
      }),
    ).resolves.toEqual(new Uint8Array([1]));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes a stale cached shell", async () => {
    const cache = fakeCache();
    seed(cache, "/shell.apk", new Uint8Array([1]), 0);
    const fetchImpl = vi.fn(async () => response([2]));
    await expect(
      loadShell("/shell.apk", {
        cache,
        fetch: fetchImpl as unknown as typeof fetch,
        now: () => SHELL_MAX_AGE_MS,
      }),
    ).resolves.toEqual(new Uint8Array([2]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      cache.store.get("/shell.apk")?.headers.get(SHELL_CACHED_AT_HEADER),
    ).toBe(String(SHELL_MAX_AGE_MS));
  });

  it("falls back to a stale cached shell when the refresh fails", async () => {
    const cache = fakeCache();
    seed(cache, "/shell.apk", new Uint8Array([3]), 0);
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      loadShell("/shell.apk", {
        cache,
        fetch: fetchImpl as unknown as typeof fetch,
        now: () => SHELL_MAX_AGE_MS,
      }),
    ).resolves.toEqual(new Uint8Array([3]));
  });

  it("fetches without a cache and reports a failed download", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchImpl);
    await expect(loadShell("/shell.apk", { cache: null })).rejects.toThrow(
      "offline",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the default error message for a bad response", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(
      loadShell("/shell.apk", {
        cache: null,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("The shell could not be loaded.");
  });

  it("uses a custom error message for a bad response", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(
      loadShell("/shell.apk", {
        cache: null,
        fetch: fetchImpl as unknown as typeof fetch,
        message: "custom failure",
      }),
    ).rejects.toThrow("custom failure");
  });

  it("fetches without a cache", async () => {
    const fetchImpl = vi.fn(async () => response([4]));
    await expect(
      loadShell("/shell.apk", {
        cache: null,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual(new Uint8Array([4]));
  });

  it("opens the shared cache and uses a fresh entry", async () => {
    const cache = fakeCache();
    const now = Date.now();
    seed(cache, "/shell.apk", new Uint8Array([5]), now);
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    const fetchImpl = vi.fn();
    await expect(
      loadShell("/shell.apk", { fetch: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual(new Uint8Array([5]));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back when the cache cannot be opened", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    const fetchImpl = vi.fn(async () => response([6]));
    await expect(
      loadShell("/shell.apk", { fetch: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual(new Uint8Array([6]));
  });

  it("continues when the cache read fails", async () => {
    const cache = fakeCache({
      match: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    const fetchImpl = vi.fn(async () => response([7]));
    await expect(
      loadShell("/shell.apk", {
        cache,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual(new Uint8Array([7]));
  });

  it("continues when the cache write fails", async () => {
    const cache = fakeCache({
      put: vi.fn(async () => {
        throw new Error("quota");
      }),
    });
    const fetchImpl = vi.fn(async () => response([8]));
    await expect(
      loadShell("/shell.apk", {
        cache,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual(new Uint8Array([8]));
  });

  it("uses the default fetch", async () => {
    const fetchImpl = vi.fn(async () => response([9]));
    vi.stubGlobal("fetch", fetchImpl);
    await expect(loadShell("/shell.apk", { cache: null })).resolves.toEqual(
      new Uint8Array([9]),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
