import { describe, expect, it } from "vitest";
import {
  formatVersionCode,
  initials,
  normalizeUrl,
  packageName,
  suggestName,
} from "./domain";

describe("normalizeUrl", () => {
  it("trims and accepts https", () => {
    const result = normalizeUrl("  https://example.com/path  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.href).toBe("https://example.com/path");
    }
  });

  it("reports http sites", () => {
    expect(normalizeUrl("http://example.com")).toEqual({
      ok: false,
      message: "Only https URLs are supported.",
    });
  });
});

describe("suggestName", () => {
  it.each([
    ["https://example.com/", "Example"],
    ["https://www.example.com/", "Example"],
    ["https://m.example.com/", "Example"],
    ["https://mobile.example.com/", "Example"],
    ["https://news.ycombinator.com/", "News"],
    ["https://www.bbc.co.uk/", "Bbc"],
    ["https://my-app.example.com/", "My app"],
    ["https://localhost/", "Localhost"],
    ["https://www./", "www"],
    ["https://127.0.0.1/", "127.0.0.1"],
    ["https://[::1]/", "[::1]"],
  ])("names %s as %s", (raw, expected) => {
    expect(suggestName(new URL(raw))).toBe(expected);
  });
});

describe("initials", () => {
  it.each([
    ["Example", "E"],
    ["  example", "E"],
    ["123 app", "1"],
    ["🎉 party", "P"],
    ["🎉", "•"],
    ["", "•"],
  ])("takes the initial of %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("packageName", () => {
  it("builds a stable 34 character package", async () => {
    const url = new URL("https://example.com/");
    const first = await packageName(url, "Example");
    const second = await packageName(url, "Example");
    expect(first).toBe(second);
    expect(first).toMatch(/^com\.urltoapk\.a[0-9a-f]{20}$/);
    expect(first).toHaveLength(34);
  });

  it("changes when the identity changes", async () => {
    const url = new URL("https://example.com/");
    const first = await packageName(url, "One");
    const second = await packageName(url, "Two");
    expect(first).not.toBe(second);
  });
});

describe("formatVersionCode", () => {
  it.each([
    [42, 42],
    [1.9, 1],
    [-5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [2_100_000_001, 2_100_000_000],
  ])("formats %s as %s", (value, expected) => {
    expect(formatVersionCode(value)).toBe(expected);
  });
});
