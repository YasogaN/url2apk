import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));
const webDir = fileURLToPath(new URL("../..", import.meta.url));

function read(name: string): string {
  return readFileSync(`${publicDir}/${name}`, "utf8");
}

function readWeb(name: string): string {
  return readFileSync(`${webDir}/${name}`, "utf8");
}

function readPage(name: string): string {
  return readFileSync(`${webDir}/pages/${name}`, "utf8");
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

  it("serves revalidated HTML without disabling compression", () => {
    const headers = read("_headers");
    expect(headers).toContain("/*");
    expect(headers).not.toContain("Cache-Control: no-transform");
    expect(headers).toContain(
      "Cache-Control: public, max-age=0, must-revalidate",
    );
  });

  it("serves a hash-based CSP", () => {
    const headers = read("_headers");
    expect(headers).toContain("'wasm-unsafe-eval'");
    expect(headers).toContain("script-src-attr 'none'");
    expect(headers).toContain("style-src-attr 'none'");
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).not.toContain("'unsafe-eval'");
    expect(headers).toMatch(/script-src[^;]*'sha256-/);
    expect(headers).toMatch(/style-src[^;]*'sha256-/);
  });

  it("caches hashed build output immutably", () => {
    const headers = read("_headers");
    expect(headers).toContain("/assets/*");
    expect(headers).toContain(
      "Cache-Control: public, max-age=31536000, immutable",
    );
  });

  it("lists every public page in the sitemap", () => {
    const sitemap = read("sitemap.xml");
    for (const page of [
      "/",
      "/website-to-apk",
      "/website-to-desktop-app",
      "/pwabuilder-alternative",
      "/apk-signing",
    ]) {
      expect(sitemap).toContain(
        `<loc>https://url2app.yasogan.dev${page}</loc>`,
      );
    }
  });

  it("gives every guide a canonical URL and an H1", () => {
    for (const page of [
      "website-to-apk.html",
      "website-to-desktop-app.html",
      "pwabuilder-alternative.html",
      "apk-signing.html",
    ]) {
      const html = readPage(page);
      expect(html).toMatch(/<h1[^>]*>/);
      expect(html).toContain(
        `<link rel="canonical" href="https://url2app.yasogan.dev/${page.replace(".html", "")}" />`,
      );
    }
  });

  it("publishes a dedicated not-found page", () => {
    const html = readPage("404.html");
    expect(html).toContain("<h1>This page is not installed.</h1>");
    expect(html).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(html).toContain("<!-- @include header -->");
    expect(html).toContain("<!-- @include footer -->");
    expect(readWeb("vite.config.ts")).toContain('"404": page("404.html")');
    expect(read("_headers")).toContain("/404.html");
  });

  it("serves a real 404 instead of the SPA shell", () => {
    const config = readWeb("wrangler.jsonc");
    expect(config).toContain('"not_found_handling": "404-page"');
    expect(config).not.toContain("single-page-application");
  });

  it("publishes a valid security.txt with a legacy redirect", () => {
    const text = read(".well-known/security.txt");
    expect(text).toMatch(/^Contact: https:\/\//m);
    expect(text).toMatch(/^Expires: /m);
    expect(text).toContain(
      "Canonical: https://url2app.yasogan.dev/.well-known/security.txt",
    );
    expect(read("_redirects")).toContain(
      "/security.txt /.well-known/security.txt 301",
    );
  });

  it("publishes a 1200x630 social card", () => {
    const png = readFileSync(`${publicDir}/og.png`);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("includes baseline security headers", () => {
    const headers = read("_headers");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
    expect(headers).toContain(
      "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
    );
  });
});
