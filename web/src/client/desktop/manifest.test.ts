import { bufferSource } from "../apk/bytes";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_THRESHOLD,
  fetchBase,
  findBase,
  formatBytes,
  loadManifest,
  needsConfirmation,
  parseManifest,
  type BaseCache,
  type BaseFile,
  type ShellManifest,
} from "./manifest";

const HELLO = new TextEncoder().encode("hello");
const HELLO_SHA =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
const base: BaseFile = {
  url: "/shells/hello.bin",
  size: HELLO.length,
  sha256: HELLO_SHA,
};
const manifest: ShellManifest = {
  version: "test",
  artifacts: {
    "linux-tar": {
      x64: base,
    },
  },
};

type FakeCache = BaseCache & {
  store: Map<string, Uint8Array>;
};

function fakeCache(
  options: {
    matchThrows?: boolean;
    deleteThrows?: boolean;
    putThrows?: boolean;
  } = {},
): FakeCache {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async match(url) {
      if (options.matchThrows) {
        throw new Error("match failed");
      }
      const bytes = store.get(url);
      return bytes === undefined ? undefined : new Response(bufferSource(bytes));
    },
    async put(url, response) {
      if (options.putThrows) {
        throw new Error("put failed");
      }
      store.set(url, new Uint8Array(await response.arrayBuffer()));
    },
    async delete(url) {
      if (options.deleteThrows) {
        throw new Error("delete failed");
      }
      return store.delete(url);
    },
  };
}

function response(bytes: Uint8Array = HELLO): Response {
  return new Response(bufferSource(bytes));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseManifest", () => {
  it("parses a manifest and ignores unknown fields", () => {
    expect(
      parseManifest({
        version: "1",
        extra: true,
        artifacts: {
          "linux-tar": { x64: base, arm64: base },
          "windows-setup-user": { x64: base },
          unknown: { x64: base },
        },
      }),
    ).toEqual({
      version: "1",
      artifacts: {
        "linux-tar": { x64: base, arm64: base },
        "windows-setup-user": { x64: base },
      },
    });
  });

  it("accepts a chunked base", () => {
    const parts = [
      { url: "/shells/part-0", size: 2, sha256: "a".repeat(64) },
      { url: "/shells/part-1", size: 3, sha256: "b".repeat(64) },
    ];
    const parsed = parseManifest({
      version: "1",
      artifacts: {
        "linux-flatpak": {
          x64: { ...base, parts },
        },
      },
    });
    expect(parsed.artifacts["linux-flatpak"]?.x64).toEqual({
      ...base,
      parts,
    });
  });

  it("accepts a squashfs offset", () => {
    const parsed = parseManifest({
      version: "1",
      artifacts: {
        "linux-appimage": {
          x64: { ...base, squashfsOffset: 944632 },
        },
      },
    });
    expect(parsed.artifacts["linux-appimage"]?.x64).toEqual({
      ...base,
      squashfsOffset: 944632,
    });
  });

  it("accepts a squashfs offset with parts", () => {
    const parts = [
      { url: "/shells/part-0", size: 2, sha256: "a".repeat(64) },
      { url: "/shells/part-1", size: 3, sha256: "b".repeat(64) },
    ];
    const parsed = parseManifest({
      version: "1",
      artifacts: {
        "linux-flatpak": {
          x64: { ...base, parts, squashfsOffset: 944632 },
        },
      },
    });
    expect(parsed.artifacts["linux-flatpak"]?.x64).toEqual({
      ...base,
      parts,
      squashfsOffset: 944632,
    });
  });

  it("accepts an empty artifact set", () => {
    expect(parseManifest({ version: "1", artifacts: {} })).toEqual({
      version: "1",
      artifacts: {},
    });
  });

  it.each([
    ["null", null],
    ["a string", "manifest"],
    ["a missing version", { artifacts: {} }],
    ["an empty version", { version: "", artifacts: {} }],
    ["missing artifacts", { version: "1" }],
    ["null artifacts", { version: "1", artifacts: null }],
    [
      "a zero squashfs offset",
      {
        version: "1",
        artifacts: {
          "linux-appimage": { x64: { ...base, squashfsOffset: 0 } },
        },
      },
    ],
    [
      "a fractional squashfs offset",
      {
        version: "1",
        artifacts: {
          "linux-appimage": { x64: { ...base, squashfsOffset: 1.5 } },
        },
      },
    ],
    [
      "a string squashfs offset",
      {
        version: "1",
        artifacts: {
          "linux-appimage": { x64: { ...base, squashfsOffset: "1" } },
        },
      },
    ],
    [
      "a zero chunked offset",
      {
        version: "1",
        artifacts: {
          "linux-flatpak": {
            x64: { ...base, parts: [{ url: "/p", size: 5, sha256: HELLO_SHA }], squashfsOffset: 0 },
          },
        },
      },
    ],
    [
      "an invalid artifact",
      { version: "1", artifacts: { "linux-tar": 3 } },
    ],
    [
      "an invalid file",
      { version: "1", artifacts: { "linux-tar": { x64: null } } },
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => parseManifest(value)).toThrow("not valid");
  });

  it.each([
    ["a missing url", { size: 1, sha256: HELLO_SHA }],
    ["an empty url", { url: "", size: 1, sha256: HELLO_SHA }],
    ["a non-string url", { url: 1, size: 1, sha256: HELLO_SHA }],
    ["a missing size", { url: "/x", sha256: HELLO_SHA }],
    ["a string size", { url: "/x", size: "1", sha256: HELLO_SHA }],
    ["a negative size", { url: "/x", size: -1, sha256: HELLO_SHA }],
    ["a fractional size", { url: "/x", size: 1.5, sha256: HELLO_SHA }],
    [
      "an unsafe size",
      { url: "/x", size: Number.MAX_SAFE_INTEGER + 1, sha256: HELLO_SHA },
    ],
    ["a missing sha256", { url: "/x", size: 1 }],
    [
      "empty parts",
      { url: "/x", size: 1, sha256: HELLO_SHA, parts: [] },
    ],
    [
      "part size mismatch",
      {
        url: "/x",
        size: 5,
        sha256: HELLO_SHA,
        parts: [{ url: "/p", size: 4, sha256: HELLO_SHA }],
      },
    ],
    [
      "an invalid part",
      {
        url: "/x",
        size: 1,
        sha256: HELLO_SHA,
        parts: [{ url: "/p", size: 1, sha256: "nope" }],
      },
    ],
    [
      "nested parts",
      {
        url: "/x",
        size: 1,
        sha256: HELLO_SHA,
        parts: [
          {
            url: "/p",
            size: 1,
            sha256: HELLO_SHA,
            parts: [{ url: "/q", size: 1, sha256: HELLO_SHA }],
          },
        ],
      },
    ],
    ["a short sha256", { url: "/x", size: 1, sha256: "abc" }],
    ["an uppercase sha256", { url: "/x", size: 1, sha256: HELLO_SHA.toUpperCase() }],
  ])("rejects a file with %s", (_label, file) => {
    expect(() =>
      parseManifest({
        version: "1",
        artifacts: { "linux-tar": { x64: file } },
      }),
    ).toThrow("not valid");
  });
});

describe("loadManifest", () => {
  it("loads and parses the manifest", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(manifest)),
    ) as unknown as typeof fetch;
    await expect(loadManifest(fetchImpl)).resolves.toEqual(manifest);
    expect(fetchImpl).toHaveBeenCalledWith("/shells.json", {
      cache: "no-store",
    });
  });

  it("rejects a missing manifest", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("no", { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(loadManifest(fetchImpl)).rejects.toThrow("could not be loaded");
  });

  it("rejects invalid JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not json"),
    ) as unknown as typeof fetch;
    await expect(loadManifest(fetchImpl)).rejects.toThrow("not valid JSON");
  });
});

describe("findBase", () => {
  it("returns the requested file", () => {
    expect(findBase(manifest, "linux-tar", "x64")).toBe(base);
  });

  it("rejects a missing artifact", () => {
    expect(() => findBase(manifest, "windows-setup-user", "x64")).toThrow(
      "not available",
    );
  });

  it("rejects a missing architecture", () => {
    expect(() => findBase(manifest, "linux-tar", "arm64")).toThrow(
      "not available",
    );
  });
});

describe("confirmation", () => {
  it("only asks above the threshold", () => {
    expect(
      needsConfirmation({ ...base, size: CONFIRMATION_THRESHOLD }),
    ).toBe(false);
    expect(
      needsConfirmation({ ...base, size: CONFIRMATION_THRESHOLD + 1 }),
    ).toBe(true);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [10 * 1024 * 1024, "10 MB"],
    [1024 ** 3, "1.0 GB"],
  ])("formats %i bytes", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("fetchBase", () => {
  it("fetches, verifies and caches a fresh download", async () => {
    const cache = fakeCache();
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    const bytes = await fetchBase(base, { cache, fetch: fetchImpl });
    expect(bytes).toEqual(HELLO);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.store.get(base.url)).toEqual(HELLO);
  });

  it("returns a valid cached copy without fetching", async () => {
    const cache = fakeCache();
    cache.store.set(base.url, HELLO);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(fetchBase(base, { cache, fetch: fetchImpl })).resolves.toEqual(
      HELLO,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("replaces an invalid cached copy", async () => {
    const cache = fakeCache();
    cache.store.set(base.url, new Uint8Array([1, 2, 3, 4, 5]));
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { cache, fetch: fetchImpl })).resolves.toEqual(
      HELLO,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.store.get(base.url)).toEqual(HELLO);
  });

  it("continues when cache operations fail", async () => {
    const cache = fakeCache({
      matchThrows: true,
      deleteThrows: true,
      putThrows: true,
    });
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { cache, fetch: fetchImpl })).resolves.toEqual(
      HELLO,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("concatenates a chunked base", async () => {
    const first = HELLO.slice(0, 2);
    const second = HELLO.slice(2);
    const chunked: BaseFile = {
      url: "/shells/part-0",
      size: HELLO.length,
      sha256: HELLO_SHA,
      parts: [
        { url: "/shells/part-0", size: first.length, sha256: await digest(first) },
        { url: "/shells/part-1", size: second.length, sha256: await digest(second) },
      ],
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      new Response(
        bufferSource(String(input) === "/shells/part-0" ? first : second),
      ),
    ) as unknown as typeof fetch;
    await expect(
      fetchBase(chunked, { cache: null, fetch: fetchImpl }),
    ).resolves.toEqual(HELLO);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reuses cached chunks", async () => {
    const first = HELLO.slice(0, 2);
    const second = HELLO.slice(2);
    const chunked: BaseFile = {
      url: "/shells/part-0",
      size: HELLO.length,
      sha256: HELLO_SHA,
      parts: [
        { url: "/shells/part-0", size: first.length, sha256: await digest(first) },
        { url: "/shells/part-1", size: second.length, sha256: await digest(second) },
      ],
    };
    const cache = fakeCache();
    cache.store.set("/shells/part-0", first);
    cache.store.set("/shells/part-1", second);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      fetchBase(chunked, { cache, fetch: fetchImpl }),
    ).resolves.toEqual(HELLO);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid chunk or a total mismatch", async () => {
    const first = HELLO.slice(0, 2);
    const second = HELLO.slice(2);
    const validParts = [
      { url: "/shells/part-0", size: first.length, sha256: await digest(first) },
      { url: "/shells/part-1", size: second.length, sha256: await digest(second) },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      new Response(
        bufferSource(String(input) === "/shells/part-0" ? first : second),
      ),
    ) as unknown as typeof fetch;
    await expect(
      fetchBase(
        {
          url: "/shells/part-0",
          size: HELLO.length,
          sha256: HELLO_SHA,
          parts: [validParts[0], { ...validParts[1], sha256: "a".repeat(64) }],
        },
        { cache: null, fetch: fetchImpl },
      ),
    ).rejects.toThrow("integrity");
    await expect(
      fetchBase(
        {
          url: "/shells/part-0",
          size: HELLO.length,
          sha256: "a".repeat(64),
          parts: validParts,
        },
        { cache: null, fetch: fetchImpl },
      ),
    ).rejects.toThrow("integrity");
  });

  it("works without a cache", async () => {
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { cache: null, fetch: fetchImpl })).resolves.toEqual(
      HELLO,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the global fetch by default", async () => {
    const fetchImpl = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetchImpl);
    await expect(fetchBase(base, { cache: null })).resolves.toEqual(HELLO);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores a failing cache delete", async () => {
    const cache = fakeCache({ deleteThrows: true });
    cache.store.set(base.url, new Uint8Array([1, 2, 3, 4, 5]));
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { cache, fetch: fetchImpl })).resolves.toEqual(
      HELLO,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("works when the Cache API is unavailable", async () => {
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { fetch: fetchImpl })).resolves.toEqual(HELLO);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the Cache API when available", async () => {
    const cache = fakeCache();
    vi.stubGlobal("caches", {
      open: vi.fn(async () => cache),
    });
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { fetch: fetchImpl })).resolves.toEqual(HELLO);
    expect(cache.store.get(base.url)).toEqual(HELLO);
  });

  it("falls back when opening the Cache API fails", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(fetchBase(base, { fetch: fetchImpl })).resolves.toEqual(HELLO);
  });

  it("rejects a failed download", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("no", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      fetchBase(base, { cache: null, fetch: fetchImpl }),
    ).rejects.toThrow("download failed");
  });

  it("rejects a wrong size", async () => {
    const fetchImpl = vi.fn(async () =>
      response(new Uint8Array([1])),
    ) as unknown as typeof fetch;
    await expect(
      fetchBase(base, { cache: null, fetch: fetchImpl }),
    ).rejects.toThrow("integrity check");
  });

  it("rejects a wrong digest", async () => {
    const fetchImpl = vi.fn(async () =>
      response(new TextEncoder().encode("HELLO")),
    ) as unknown as typeof fetch;
    await expect(
      fetchBase(base, { cache: null, fetch: fetchImpl }),
    ).rejects.toThrow("integrity check");
  });
});
