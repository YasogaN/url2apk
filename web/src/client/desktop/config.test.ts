import { describe, expect, it } from "vitest";
import {
  DESKTOP_DEFAULT_HEIGHT,
  DESKTOP_DEFAULT_WIDTH,
  DESKTOP_MAX_HEIGHT,
  DESKTOP_MAX_WIDTH,
  DESKTOP_MIN_HEIGHT,
  DESKTOP_MIN_WIDTH,
  buildDesktopConfig,
  desktopAppId,
  normalizeDesktopName,
  packageBase,
  serializeConfig,
  slugifyName,
  type DesktopConfig,
} from "./config";

describe("normalizeDesktopName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDesktopName("  My   App  ")).toEqual({
      ok: true,
      name: "My App",
    });
  });

  it("normalizes composed characters", () => {
    expect(normalizeDesktopName("Cafe\u0301")).toEqual({
      ok: true,
      name: "Café",
    });
  });

  it("accepts Unicode letters and marks", () => {
    expect(normalizeDesktopName("日本語")).toEqual({
      ok: true,
      name: "日本語",
    });
    expect(normalizeDesktopName("A&B (test)")).toEqual({
      ok: true,
      name: "A&B (test)",
    });
  });

  it("rejects an empty name", () => {
    expect(normalizeDesktopName("   ")).toEqual({
      ok: false,
      message: "Give the app a name.",
    });
  });

  it("rejects names longer than the limit", () => {
    expect(normalizeDesktopName("a".repeat(65))).toEqual({
      ok: false,
      message: "Use 64 characters or fewer.",
    });
    expect(normalizeDesktopName("a".repeat(64)).ok).toBe(true);
  });

  it("rejects emoji, flags and variation selectors", () => {
    for (const name of ["Café 😀", "🇺🇸", "❤️"]) {
      expect(normalizeDesktopName(name)).toEqual({
        ok: false,
        message: "Emojis are not supported in app names.",
      });
    }
  });

  it("rejects control characters", () => {
    expect(normalizeDesktopName("My\u0000App")).toEqual({
      ok: false,
      message: "Use letters, numbers, spaces and - _ . ' & ( ) only.",
    });
  });

  it("rejects disallowed punctuation", () => {
    expect(normalizeDesktopName("My/App")).toEqual({
      ok: false,
      message: "Use letters, numbers, spaces and - _ . ' & ( ) only.",
    });
  });

  it("requires a letter or number", () => {
    expect(normalizeDesktopName("---")).toEqual({
      ok: false,
      message: "Use at least one letter or number.",
    });
  });
});

describe("slugifyName", () => {
  it("turns a display name into a file-safe slug", () => {
    expect(slugifyName("My App")).toBe("my-app");
  });

  it("strips combining marks", () => {
    expect(slugifyName("Café")).toBe("cafe");
  });

  it("falls back when the name has no ASCII letters", () => {
    expect(slugifyName("日本語")).toBe("app");
    expect(slugifyName("---")).toBe("app");
  });

  it("truncates and removes a trailing separator", () => {
    const slug = slugifyName(`${"a".repeat(47)} b`);
    expect(slug).toBe("a".repeat(47));
  });
});

describe("desktopAppId", () => {
  it("is deterministic and short", () => {
    const first = desktopAppId("https://example.com/", "Example");
    const second = desktopAppId("https://example.com/", "Example");
    expect(first).toBe(second);
    expect(first).toMatch(/^napp-[0-9a-f]{12}$/);
  });

  it("changes with the URL or the name", () => {
    expect(desktopAppId("https://example.com/", "Example")).not.toBe(
      desktopAppId("https://example.org/", "Example"),
    );
    expect(desktopAppId("https://example.com/", "Example")).not.toBe(
      desktopAppId("https://example.com/", "Different"),
    );
  });
});

describe("buildDesktopConfig", () => {
  it("builds a normalized config", () => {
    const result = buildDesktopConfig({
      url: "https://example.com",
      name: "  My   App ",
      width: 1000,
      height: 700,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.config).toMatchObject({
      schema: 1,
      url: "https://example.com/",
      name: "My App",
      width: 1000,
      height: 700,
    });
    expect(result.config.id).toMatch(/^napp-[0-9a-f]{12}$/);
  });

  it("uses defaults for missing or invalid dimensions", () => {
    const result = buildDesktopConfig({
      url: "https://example.com/",
      name: "Example",
      width: Number.NaN,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.config.width).toBe(DESKTOP_DEFAULT_WIDTH);
    expect(result.config.height).toBe(DESKTOP_DEFAULT_HEIGHT);
  });

  it("clamps dimensions", () => {
    const small = buildDesktopConfig({
      url: "https://example.com/",
      name: "Example",
      width: 1,
      height: 1,
    });
    const large = buildDesktopConfig({
      url: "https://example.com/",
      name: "Example",
      width: 99999,
      height: 99999,
    });
    expect(small.ok && small.config.width).toBe(DESKTOP_MIN_WIDTH);
    expect(small.ok && small.config.height).toBe(DESKTOP_MIN_HEIGHT);
    expect(large.ok && large.config.width).toBe(DESKTOP_MAX_WIDTH);
    expect(large.ok && large.config.height).toBe(DESKTOP_MAX_HEIGHT);
  });

  it("rejects an invalid URL", () => {
    expect(
      buildDesktopConfig({ url: "http://example.com/", name: "Example" }),
    ).toEqual({
      ok: false,
      message: "Only https URLs are supported.",
    });
    expect(
      buildDesktopConfig({ url: "https://localhost/", name: "Example" }),
    ).toEqual({
      ok: false,
      message: "Private and local hosts are not supported.",
    });
  });

  it("rejects an invalid name", () => {
    expect(
      buildDesktopConfig({ url: "https://example.com/", name: "My/App" }),
    ).toEqual({
      ok: false,
      message: "Use letters, numbers, spaces and - _ . ' & ( ) only.",
    });
  });
});

describe("serializeConfig", () => {
  it("writes JSON that round trips", () => {
    const result = buildDesktopConfig({
      url: "https://example.com/",
      name: "Example",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = JSON.parse(
      new TextDecoder().decode(serializeConfig(result.config)),
    ) as DesktopConfig;
    expect(parsed).toEqual(result.config);
  });
});

describe("packageBase", () => {
  it("combines the slug and the short id", () => {
    const config: DesktopConfig = {
      schema: 1,
      id: "napp-0123456789ab",
      url: "https://example.com/",
      name: "My App",
      width: 1200,
      height: 780,
    };
    expect(packageBase(config)).toBe("my-app-6789ab");
  });
});
