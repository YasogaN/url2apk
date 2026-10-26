import { Hono } from "hono";
import { findIcon } from "./icons";
import { parseTarget } from "./target";

export const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  c.header("cross-origin-opener-policy", "same-origin");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
});

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

export default app;
