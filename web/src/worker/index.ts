import { Hono } from "hono";
import { findIcon } from "./icons";
import { parseTarget } from "./target";

export type Bindings = {
  ASSETS: Fetcher;
};

export const app = new Hono<{ Bindings: Bindings }>();

const OLD_HOST = "url2apk.yasogan.dev";
const NEW_HOST = "url2app.yasogan.dev";

app.use("*", async (c, next) => {
  const current = new URL(c.req.url);
  if (current.hostname === OLD_HOST) {
    current.protocol = "https:";
    current.hostname = NEW_HOST;
    return c.redirect(current.toString(), 301);
  }
  await next();
});

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

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
