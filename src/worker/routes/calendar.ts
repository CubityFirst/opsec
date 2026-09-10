import { Hono } from "hono";
import { getDb } from "../db";
import type { AppEnv } from "../env";
import { feedByKey, renderFeed } from "../services/calendar";
import { resolveUser } from "../services/tokens";

/**
 * Public iCalendar endpoint: `GET /calendar/<key>.ics`. Calendar clients send
 * neither cookies nor headers, so the per-feed secret in the path is the whole
 * credential; an unknown key is a plain 404. Lives outside /api like /mcp.
 */
const app = new Hono<AppEnv>();

app.get("/calendar/:file", async (c) => {
  const m = /^([A-Za-z0-9_-]{16,})\.ics$/.exec(c.req.param("file"));
  if (!m) return c.notFound();
  const db = getDb(c.env.DB);
  const feed = await feedByKey(db, m[1]!);
  if (!feed) return c.notFound();
  // The owner must still be allowed in (oidc mode); a locked-out account takes its feeds with it.
  if (!(await resolveUser(db, c.env, feed.sub))) return c.notFound();
  const body = await renderFeed(db, feed, new URL(c.req.url).origin);
  return c.body(body, 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": `inline; filename="${feed.name.replace(/[^\w .-]+/g, "_") || "calendar"}.ics"`,
    "cache-control": "private, no-cache",
  });
});

export default app;
