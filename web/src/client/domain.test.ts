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
  it.each([
    ["https://example.com/", "com.example"],
    ["https://www.example.com/", "com.example.www"],
    ["https://news.ycombinator.com/", "com.ycombinator.news"],
    ["https://www.bbc.co.uk/", "uk.co.bbc.www"],
    ["https://my-app.example.com/", "com.example.my_app"],
    ["https://123.example.com/", "com.example.a123"],
    ["https://class.example.com/", "com.example.class_"],
    ["https://--.example.com/", "com.example.site"],
    ["https://_foo_.example.com/", "com.example.foo"],
    ["https://localhost/", "app.localhost"],
    ["https://192.168.1.1/", "a1.a1.a168.a192"],
    ["https://example.com./", "com.example"],
    ["https://xn--bcher-kva.example.com/", "com.example.xn__bcher_kva"],
  ])("maps %s to %s", (raw, expected) => {
    expect(packageName(new URL(raw))).toBe(expected);
  });

  it("truncates long hosts to the template slot", () => {
    const long = `${"a".repeat(200)}.example.com`;
    const value = packageName(new URL(`https://${long}/`));
    expect(value.length).toBeLessThanOrEqual(127);
    expect(value.startsWith("com.example.")).toBe(true);
    expect(value.endsWith(".")).toBe(false);
    expect(value.endsWith("_")).toBe(false);
  });

  it("is stable for the same url", () => {
    const url = new URL("https://example.com/");
    expect(packageName(url)).toBe(packageName(url));
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
