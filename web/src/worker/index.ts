import { Hono } from "hono";
import { findIcon } from "./icons";
import { parseTarget } from "./target";

export type Bindings = {
  ASSETS: Fetcher;
};

export const app = new Hono<{ Bindings: Bindings }>();

const HTML_CACHE_CONTROL = "public, no-transform, max-age=0, must-revalidate";

function withHtmlCacheControl(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("cache-control", HTML_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/favicon", async (c) => {
  const raw = c.req.query("url");
  if (raw === undefined || raw.trim() === "") {
    return c.json({ error: "Provide a url query parameter." }, 400);
  }

  const target = parseTarget(raw.trim());
  if (!target.ok) {
    return c.json({ error: target.message }, 400);
  }

  try {
    const icon = await findIcon(target.url);
    if (icon === null) {
      return c.json({ error: "No icon was found for that site." }, 404);
    }
    return new Response(icon.body, {
      headers: {
        "content-type": icon.type,
        "cache-control": "public, max-age=86400, s-maxage=604800",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return c.json({ error: "The site could not be fetched." }, 502);
  }
});

app.all("*", async (c) =>
  withHtmlCacheControl(await c.env.ASSETS.fetch(c.req.raw)),
);

export default app;
