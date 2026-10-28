import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/client", import.meta.url));
const headers = readFileSync(join(dist, "_headers"), "utf8");
const line = headers
  .split("\n")
  .find((entry) => entry.trim().startsWith("Content-Security-Policy:"));
if (line === undefined) {
  throw new Error("No Content-Security-Policy in the built _headers file.");
}
const policy = line.slice(line.indexOf(":") + 1).trim();
const directives = new Map(
  policy
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values];
    }),
);
const scriptSrc = directives.get("script-src") ?? [];
const styleSrc = directives.get("style-src") ?? [];

for (const [name, values] of [
  ["script-src", scriptSrc],
  ["style-src", styleSrc],
]) {
  for (const value of ["'unsafe-inline'", "'unsafe-eval'"]) {
    if (values.includes(value)) {
      throw new Error(`${name} still contains ${value}.`);
    }
  }
}

function hash(text) {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

let styles = 0;
let scripts = 0;
for (const name of readdirSync(dist).filter((entry) => entry.endsWith(".html"))) {
  const html = readFileSync(join(dist, name), "utf8");
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    const digest = hash(match[1]);
    if (!styleSrc.includes(`'sha256-${digest}'`)) {
      throw new Error(`${name} has an unlisted <style> hash: sha256-${digest}`);
    }
    styles += 1;
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(match[1]) || match[2].trim() === "") {
      continue;
    }
    const digest = hash(match[2]);
    if (!scriptSrc.includes(`'sha256-${digest}'`)) {
      throw new Error(`${name} has an unlisted inline <script> hash: sha256-${digest}`);
    }
    scripts += 1;
  }
}

if (styles === 0 || scripts === 0) {
  throw new Error("The built HTML did not contain both inline styles and scripts.");
}
console.log(`CSP hashes verified: ${styles} style(s), ${scripts} inline script(s).`);
