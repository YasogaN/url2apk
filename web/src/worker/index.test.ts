import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const assets = (body = "asset"): Fetcher =>
  ({
    fetch: vi.fn(async () => new Response(body)),
  }) as unknown as Fetcher;

describe("favicon api", () => {
  it("reports health", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("requires a url", async () => {
    for (const path of [
      "/api/favicon",
      "/api/favicon?url=",
      "/api/favicon?url=%20",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Provide a url query parameter.",
      });
    }
  });

  it("rejects invalid urls", async () => {
    const response = await app.request(
      `/api/favicon?url=${encodeURIComponent("http://example.com/")}`,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only https URLs are supported.",
    });
  });

  it("rejects single-label hosts", async () => {
    const response = await app.request(
      `/api/favicon?url=${encodeURIComponent("https://yasogan")}`,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter a full domain name, e.g. example.com.",
    });
  });

  it("returns the best icon", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return new Response('<link rel="icon" href="/icon.png">', {
          headers: { "content-type": "text/html" },
        });
      }
      if (url === "https://example.com/icon.png") {
        return new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "image/png" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const response = await app.request(
      `/api/favicon?url=${encodeURIComponent("https://example.com/")}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2,
    ]);
  });

  it("returns 404 when no icon exists", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("no", { status: 404 });
    });

    const response = await app.request(
      `/api/favicon?url=${encodeURIComponent("https://example.com/")}`,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No icon was found for that site.",
    });
  });

  it("returns 502 when the page cannot be fetched", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const response = await app.request(
      `/api/favicon?url=${encodeURIComponent("https://example.com/")}`,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The site could not be fetched.",
    });
  });
});

describe("static assets", () => {
  it("serves unknown paths from the assets binding", async () => {
    const fake = assets("hello");
    const response = await app.request(
      "https://example.com/anything",
      {},
      { ASSETS: fake },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello");
    expect(fake.fetch).toHaveBeenCalledTimes(1);
  });

  it("also serves unknown api paths from assets", async () => {
    const fake = assets("spa");
    const response = await app.request("/api/unknown", {}, { ASSETS: fake });
    expect(await response.text()).toBe("spa");
  });

  it("marks HTML responses as no-transform", async () => {
    const fake = {
      fetch: vi.fn(
        async () =>
          new Response("html", {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "public, max-age=0",
            },
          }),
      ),
    } as unknown as Fetcher;
    const response = await app.request("/", {}, { ASSETS: fake });
    expect(response.headers.get("cache-control")).toBe(
      "public, no-transform, max-age=0, must-revalidate",
    );
    expect(await response.text()).toBe("html");
  });

  it("leaves non-HTML responses untouched", async () => {
    const fake = {
      fetch: vi.fn(
        async () =>
          new Response("{}", {
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=86400",
            },
          }),
      ),
    } as unknown as Fetcher;
    const response = await app.request("/api/unknown", {}, { ASSETS: fake });
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("leaves responses without a content type untouched", async () => {
    const bare = new Response("blob");
    bare.headers.delete("content-type");
    const fake = {
      fetch: vi.fn(async () => bare),
    } as unknown as Fetcher;
    const response = await app.request("/anything", {}, { ASSETS: fake });
    expect(response.headers.get("content-type")).toBeNull();
  });
});
