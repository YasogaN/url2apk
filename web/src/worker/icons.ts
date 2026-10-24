import { parseTarget } from "./target";

export type IconResult = {
  body: ArrayBuffer;
  type: string;
};

type Candidate = {
  url: URL;
  size: number;
};

type Fetched = {
  response: Response;
  finalUrl: URL;
};

const MAX_HTML_BYTES = 512 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = "url-to-apk/1.0 (+https://github.com/)";
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Finds the best icon for a public page: the largest manifest icon, then
 * apple-touch/link icons, then /favicon.ico. Every URL is re-validated so a
 * redirect cannot walk the worker into a private network.
 */
export async function findIcon(target: URL): Promise<IconResult | null> {
  const page = await fetchText(
    target,
    "text/html,application/xhtml+xml",
    MAX_HTML_BYTES,
  );
  const candidates = await discoverCandidates(page.text, page.baseUrl);

  for (const candidate of candidates) {
    const icon = await fetchIcon(candidate);
    if (icon !== null) {
      return icon;
    }
  }
  return null;
}

async function fetchText(
  target: URL,
  accept: string,
  maxBytes: number,
): Promise<{ text: string; baseUrl: URL }> {
  const { response, finalUrl } = await fetchFollowingRedirects(target, accept);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = await readLimited(response, maxBytes);
  return {
    text: contentType.includes("html") ? new TextDecoder().decode(body) : "",
    baseUrl: finalUrl,
  };
}

async function fetchFollowingRedirects(
  url: URL,
  accept: string,
): Promise<Fetched> {
  let current = url;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get("location");
      if (location === null) {
        throw new Error("Redirect without a location.");
      }
      const next = parseTarget(new URL(location, current).toString());
      if (!next.ok) {
        throw new Error(next.message);
      }
      current = next.url;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}.`);
    }
    return { response, finalUrl: current };
  }
  throw new Error("Too many redirects.");
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > maxBytes) {
    throw new Error("Response is too large.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes) {
    throw new Error("Response is too large.");
  }
  return body;
}

async function discoverCandidates(
  html: string,
  baseUrl: URL,
): Promise<URL[]> {
  const candidates: Candidate[] = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  let manifestHref: string | null = null;

  for (const tag of links) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr(tag, "href");
    if (href === undefined) {
      continue;
    }
    if (rel.includes("manifest")) {
      if (manifestHref === null) {
        manifestHref = href;
      }
      continue;
    }
    if (rel.some((part) => part === "icon" || part.startsWith("apple-touch-icon"))) {
      const url = toHttpsUrl(href, baseUrl);
      if (url !== null) {
        candidates.push({ url, size: parseSizes(attr(tag, "sizes") ?? "") });
      }
    }
  }

  const tile = metaContent(html, "msapplication-TileImage");
  if (tile !== null) {
    const url = toHttpsUrl(tile, baseUrl);
    if (url !== null) {
      candidates.push({ url, size: 144 });
    }
  }

  if (manifestHref !== null) {
    const manifestUrl = toHttpsUrl(manifestHref, baseUrl);
    if (manifestUrl !== null) {
      candidates.push(...(await fetchManifestIcons(manifestUrl)));
    }
  }

  const fallback = new URL("/favicon.ico", baseUrl);
  candidates.push({ url: fallback, size: 0 });

  candidates.sort((a, b) => b.size - a.size);
  return dedupe(candidates).map((candidate) => candidate.url);
}

async function fetchManifestIcons(manifestUrl: URL): Promise<Candidate[]> {
  const target = parseTarget(manifestUrl.toString());
  if (!target.ok) {
    return [];
  }

  let fetched: Fetched;
  try {
    fetched = await fetchFollowingRedirects(
      target.url,
      "application/manifest+json,application/json",
    );
  } catch {
    return [];
  }

  let json: unknown;
  try {
    const body = await readLimited(fetched.response, MAX_MANIFEST_BYTES);
    json = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return [];
  }

  if (typeof json !== "object" || json === null) {
    return [];
  }
  const icons = (json as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) {
    return [];
  }

  const result: Candidate[] = [];
  for (const icon of icons) {
    if (typeof icon !== "object" || icon === null) {
      continue;
    }
    const src = (icon as { src?: unknown }).src;
    if (typeof src !== "string") {
      continue;
    }
    const sizes = (icon as { sizes?: unknown }).sizes;
    const url = toHttpsUrl(src, fetched.finalUrl);
    if (url !== null) {
      result.push({
        url,
        size: parseSizes(typeof sizes === "string" ? sizes : ""),
      });
    }
  }
  return result;
}

async function fetchIcon(url: URL): Promise<IconResult | null> {
  const target = parseTarget(url.toString());
  if (!target.ok) {
    return null;
  }

  try {
    const { response } = await fetchFollowingRedirects(target.url, "image/*");
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const isIco =
      type === "application/octet-stream" &&
      target.url.pathname.toLowerCase().endsWith(".ico");
    if (!type.startsWith("image/") && !isIco) {
      return null;
    }
    const body = await readLimited(response, MAX_ICON_BYTES);
    return { body, type: isIco ? "image/x-icon" : type };
  } catch {
    return null;
  }
}

function toHttpsUrl(href: string, baseUrl: URL): URL | null {
  let resolved: URL;
  try {
    resolved = new URL(href, baseUrl);
  } catch {
    return null;
  }
  return resolved.protocol === "https:" ? resolved : null;
}

function parseSizes(value: string): number {
  let size = 0;
  for (const match of value.matchAll(/(\d+)x(\d+)/gi)) {
    size = Math.max(size, Number(match[1]), Number(match[2]));
  }
  return size;
}

function attr(tag: string, name: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = attr(tag, "name") ?? attr(tag, "property");
    if (key !== undefined && key.toLowerCase() === name.toLowerCase()) {
      return attr(tag, "content") ?? null;
    }
  }
  return null;
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.url.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
