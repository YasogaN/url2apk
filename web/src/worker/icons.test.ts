import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findIcon } from "./icons";

type Handler = (init?: RequestInit) => Response | Promise<Response>;

let routes: Map<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn>;

const html = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const image = (
  bytes = new Uint8Array([1, 2, 3]),
  type = "image/png",
): Response =>
  new Response(bytes, {
    status: 200,
    headers: { "content-type": type },
  });

const redirect = (location: string, status = 302): Response =>
  new Response(null, { status, headers: { location } });

beforeEach(() => {
  routes = new Map();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const handler = routes.get(url);
    if (handler === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findIcon", () => {
  it("finds a page link icon", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/icon.png" sizes="64x64">'),
    );
    routes.set("https://example.com/icon.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/png");
    expect(Array.from(new Uint8Array(icon!.body))).toEqual([1, 2, 3]);
  });

  it("prefers the largest manifest icon", async () => {
    routes.set(
      "https://example.com/",
      () =>
        html(
          '<link rel="icon" href="/small.png" sizes="32x32"><link rel="manifest" href="/manifest.json">',
        ),
    );
    routes.set("https://example.com/manifest.json", () =>
      json({
        icons: [
          { src: "/big.png", sizes: "512x512", type: "image/png" },
          { src: "/mid.png", sizes: "192x192", type: "image/png" },
        ],
      }),
    );
    routes.set("https://example.com/big.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls).toContain("https://example.com/manifest.json");
    expect(calls).toContain("https://example.com/big.png");
    expect(calls).not.toContain("https://example.com/mid.png");
    expect(calls).not.toContain("https://example.com/small.png");
  });

  it("supports apple touch icons and single quoted attributes", async () => {
    routes.set("https://example.com/", () =>
      html("<link rel='apple-touch-icon' href='/apple.png' sizes='180x180'>"),
    );
    routes.set("https://example.com/apple.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/png");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(
      "https://example.com/apple.png",
    );
  });

  it("supports msapplication tile images with unquoted attributes", async () => {
    routes.set("https://example.com/", () =>
      html("<meta name=msapplication-TileImage content=/tile.png>"),
    );
    routes.set("https://example.com/tile.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/png");
  });

  it("supports property based tile images", async () => {
    routes.set("https://example.com/", () =>
      html('<meta property="msapplication-TileImage" content="/tile.png">'),
    );
    routes.set("https://example.com/tile.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/png");
  });

  it("ignores a tile without content", async () => {
    routes.set("https://example.com/", () =>
      html('<meta name="msapplication-TileImage">'),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/png");
  });

  it("falls back to favicon.ico", async () => {
    routes.set("https://example.com/", () => html("<html></html>"));
    routes.set("https://example.com/favicon.ico", () =>
      image(new Uint8Array([9]), "image/x-icon"),
    );

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/x-icon");
    expect(Array.from(new Uint8Array(icon!.body))).toEqual([9]);
  });

  it("falls back when a declared icon is missing", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/missing.png">'),
    );
    routes.set("https://example.com/missing.png", () =>
      new Response("no", { status: 404 }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
  });

  it("returns null when nothing works", async () => {
    routes.set("https://example.com/", () => html("<html></html>"));
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("throws when the page cannot be fetched", async () => {
    routes.set("https://example.com/", () => new Response("boom", { status: 500 }));

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Upstream returned 500.",
    );
  });

  it("follows redirects and resolves relative icons against the final url", async () => {
    routes.set("https://example.com/", () => redirect("/home"));
    routes.set("https://example.com/home", () =>
      html('<link rel="icon" href="icon.png">'),
    );
    routes.set("https://example.com/icon.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
  });

  it("rejects a redirect without a location", async () => {
    routes.set("https://example.com/", () => new Response(null, { status: 302 }));

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Redirect without a location.",
    );
  });

  it("rejects a redirect into a private host", async () => {
    routes.set("https://example.com/", () => redirect("https://127.0.0.1/"));

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Private and local hosts are not supported.",
    );
  });

  it("rejects too many redirects", async () => {
    routes.set("https://example.com/", () => redirect("/1"));
    routes.set("https://example.com/1", () => redirect("/2"));
    routes.set("https://example.com/2", () => redirect("/3"));
    routes.set("https://example.com/3", () => redirect("/4"));
    routes.set("https://example.com/4", () => redirect("/5"));

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Too many redirects.",
    );
  });

  it("rejects pages that declare an oversized content length", async () => {
    routes.set(
      "https://example.com/",
      () =>
        new Response("<html></html>", {
          headers: {
            "content-type": "text/html",
            "content-length": String(10 * 1024 * 1024),
          },
        }),
    );

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Response is too large.",
    );
  });

  it("rejects pages whose body is oversized without a content length", async () => {
    routes.set(
      "https://example.com/",
      () =>
        new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
          headers: { "content-type": "text/html" },
        }),
    );

    await expect(findIcon(new URL("https://example.com/"))).rejects.toThrow(
      "Response is too large.",
    );
  });

  it("tolerates an unparsable content length", async () => {
    routes.set(
      "https://example.com/",
      () =>
        new Response("<html></html>", {
          headers: {
            "content-type": "text/html",
            "content-length": "not-a-number",
          },
        }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("falls back for non-html pages", async () => {
    routes.set(
      "https://example.com/",
      () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "application/pdf" },
        }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("falls back when the page has no content type", async () => {
    routes.set(
      "https://example.com/",
      () => new Response(new Uint8Array([60, 104, 116, 109, 108, 62])),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores non-icon links and insecure tile images", async () => {
    routes.set("https://example.com/", () =>
      html(
        '<link rel="stylesheet" href="/style.css">' +
          '<link href="/no-rel.png">' +
          '<meta name="msapplication-TileImage" content="http://example.com/tile.png">',
      ),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("accepts ico icons served as octet streams", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/octet.ico">'),
    );
    routes.set("https://example.com/octet.ico", () =>
      image(new Uint8Array([7]), "application/octet-stream"),
    );

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon?.type).toBe("image/x-icon");
    expect(Array.from(new Uint8Array(icon!.body))).toEqual([7]);
  });

  it("ignores octet streams that are not ico files", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/octet.png">'),
    );
    routes.set("https://example.com/octet.png", () =>
      image(new Uint8Array([7]), "application/octet-stream"),
    );
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("ignores non-image icon responses", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/plain">'),
    );
    routes.set("https://example.com/plain", () =>
      new Response("text", { headers: { "content-type": "text/plain" } }),
    );
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("ignores icon responses without a content type", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/none">'),
    );
    routes.set("https://example.com/none", () => new Response(new Uint8Array([1])));
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("ignores oversized icons", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/big.png">'),
    );
    routes.set(
      "https://example.com/big.png",
      () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-type": "image/png",
            "content-length": String(3 * 1024 * 1024),
          },
        }),
    );
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("skips insecure and malformed icon links", async () => {
    routes.set(
      "https://example.com/",
      () =>
        html(
          '<link rel="icon" href="http://example.com/insecure.png"><link rel="icon" href="http://[">',
        ),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("accepts protocol relative icon links", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="//cdn.example.com/icon.png">'),
    );
    routes.set("https://cdn.example.com/icon.png", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("skips links without href and uses uppercase rel", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon"><link rel="ICON" href="/upper.png">'),
    );
    routes.set("https://example.com/upper.png", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("uses only the first manifest link", async () => {
    routes.set("https://example.com/", () =>
      html(
        '<link rel="manifest" href="/one.json"><link rel="manifest" href="/two.json">',
      ),
    );
    routes.set("https://example.com/one.json", () => json({ icons: [] }));
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(
      "https://example.com/two.json",
    );
  });

  it("skips a manifest link without href", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest"><link rel="icon" href="/icon.png">'),
    );
    routes.set("https://example.com/icon.png", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("skips a manifest on an insecure url", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="http://example.com/manifest.json">'),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("skips a private manifest url", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="https://127.0.0.1/manifest.json">'),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores a manifest that cannot be fetched", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () =>
      new Response("no", { status: 404 }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores a manifest with invalid json", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () =>
      new Response("{", { headers: { "content-type": "application/json" } }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores an oversized manifest", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set(
      "https://example.com/manifest.json",
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(1024 * 1024),
          },
        }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores null, array and malformed manifests", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () => json(null));
    routes.set("https://example.com/favicon.ico", () => image());
    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();

    routes.set("https://example.com/manifest.json", () => json([]));
    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();

    routes.set("https://example.com/manifest.json", () => json({ icons: "nope" }));
    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("skips malformed manifest icon entries", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () =>
      json({
        icons: [
          null,
          42,
          { sizes: "32x32" },
          { src: 1 },
          { src: "http://example.com/insecure.png" },
          { src: "/x.png", sizes: 512 },
          { src: "/y.png" },
        ],
      }),
    );
    routes.set("https://example.com/x.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(
      "https://example.com/x.png",
    );
  });

  it("ignores an invalid manifest icon url", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () =>
      json({ icons: [{ src: "http://[" }] }),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("deduplicates identical candidates", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/same.png"><link rel="icon" href="/same.png">'),
    );
    routes.set("https://example.com/same.png", () => image());

    await findIcon(new URL("https://example.com/"));
    const same = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url === "https://example.com/same.png");
    expect(same).toHaveLength(1);
  });

  it("parses size lists and ignores unparsable sizes", async () => {
    routes.set("https://example.com/", () =>
      html(
        '<link rel="icon" href="/a.png" sizes="32x32 256x256"><link rel="icon" href="/b.png" sizes="any">',
      ),
    );
    routes.set("https://example.com/a.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(
      "https://example.com/a.png",
    );
  });

  it("follows icon redirects", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/icon.png">'),
    );
    routes.set("https://example.com/icon.png", () => redirect("/real.png"));
    routes.set("https://example.com/real.png", () => image());

    const icon = await findIcon(new URL("https://example.com/"));
    expect(icon).not.toBeNull();
  });

  it("ignores an icon redirect into a private host", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="icon" href="/icon.png">'),
    );
    routes.set("https://example.com/icon.png", () =>
      redirect("https://127.0.0.1/private.png"),
    );
    routes.set("https://example.com/favicon.ico", () =>
      new Response("no", { status: 404 }),
    );

    await expect(findIcon(new URL("https://example.com/"))).resolves.toBeNull();
  });

  it("skips private icon links and unknown meta tags", async () => {
    routes.set("https://example.com/", () =>
      html(
        '<meta charset="utf-8"><link rel="icon" href="https://127.0.0.1/icon.png">',
      ),
    );
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });

  it("ignores a primitive manifest", async () => {
    routes.set("https://example.com/", () =>
      html('<link rel="manifest" href="/manifest.json">'),
    );
    routes.set("https://example.com/manifest.json", () => json(42));
    routes.set("https://example.com/favicon.ico", () => image());

    await expect(findIcon(new URL("https://example.com/"))).resolves.not.toBeNull();
  });
});
