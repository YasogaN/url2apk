import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

function read(name: string): string {
  return readFileSync(`${publicDir}/${name}`, "utf8");
}

describe("discovery files", () => {
  it("publishes an llms.txt with one heading and links", () => {
    const text = read("llms.txt");
    expect(text.startsWith("# URL to App\n")).toBe(true);
    expect(text).toMatch(/^> /m);
    expect(text).toMatch(/\]\(https:\/\//);
    expect(text.match(/^# /gm)).toHaveLength(1);
  });

  it("publishes a schema-shaped ai-catalog manifest", () => {
    const manifest = JSON.parse(read("ai-catalog.json")) as {
      specVersion: string;
      host: { displayName: string };
      entries: Array<{
        identifier: string;
        type: string;
        url?: string;
        data?: unknown;
      }>;
    };
    expect(manifest.specVersion).toBe("1.0");
    expect(manifest.host.displayName).toBe("URL to App");
    expect(manifest.entries.length).toBeGreaterThan(0);
    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(
        /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/,
      );
      expect(entry.type).toBeTypeOf("string");
      expect(Boolean(entry.url) !== Boolean(entry.data)).toBe(true);
    }
  });

  it("serves the same catalog from the well-known path", () => {
    expect(read(".well-known/ai-catalog.json")).toBe(read("ai-catalog.json"));
  });

  it("references the sitemap from robots.txt", () => {
    expect(read("robots.txt")).toContain(
      "Sitemap: https://url2app.yasogan.dev/sitemap.xml",
    );
    expect(read("sitemap.xml")).toContain(
      "<loc>https://url2app.yasogan.dev/</loc>",
    );
  });

  it("keeps the no-transform policy for static documents", () => {
    const headers = read("_headers");
    expect(headers).toContain("/*");
    expect(headers).toContain(
      "Cache-Control: public, no-transform, max-age=0, must-revalidate",
    );
  });

  it("caches hashed build output immutably", () => {
    const headers = read("_headers");
    expect(headers).toContain("/assets/*");
    expect(headers).toContain(
      "Cache-Control: public, max-age=31536000, immutable",
    );
  });

  it("includes baseline security headers", () => {
    const headers = read("_headers");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
  });
});
