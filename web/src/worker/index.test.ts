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

describe("favicon api", () => {
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
    expect(response.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
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

