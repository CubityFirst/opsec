import { Hono } from "hono";
import { getDb } from "./db";
import type { AppEnv } from "./env";
import { errorHandler } from "./lib/errors";
import { requireAuth, sessionMiddleware } from "./middleware/auth";
import activity from "./routes/activity";
import aiSettings from "./routes/ai-settings";
import ask from "./routes/ask";
import auth from "./routes/auth";
import contacts from "./routes/contacts";
import dev from "./routes/dev";
import files from "./routes/files";
import interactions from "./routes/interactions";
import lifeEvents from "./routes/life-events";
import relationshipTypes from "./routes/relationship-types";
import relationships from "./routes/relationships";
import search from "./routes/search";
import tags from "./routes/tags";

const app = new Hono<AppEnv>();

const CANONICAL_HOST = "opsec.cubityfir.st";
const LEGACY_HOSTS = new Set(["nexus.cubityfir.st"]);

app.onError(errorHandler);

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  // The app used to live at nexus.cubityfir.st; keep bookmarks and the old OIDC
  // redirect URI working by sending everything to the canonical host.
  if (LEGACY_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL_HOST;
    return c.redirect(url.toString(), 308);
  }
  await next();
});
app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

app.use("/api/*", async (c, next) => {
  c.set("db", getDb(c.env.DB));
  await next();
});
// Sign-in state for every API request, then a hard gate for everything that is
// not public (health, /api/auth/*, and local seeding in development).
app.use("/api/*", sessionMiddleware);
app.use("/api/*", requireAuth);

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api", auth);
app.route("/api", contacts);
app.route("/api", tags);
app.route("/api", relationshipTypes);
app.route("/api", relationships);
app.route("/api", interactions);
app.route("/api", lifeEvents);
app.route("/api", activity);
app.route("/api", files);
app.route("/api", search);
app.route("/api", dev);
app.route("/api", ask);
app.route("/api", aiSettings);

// Static assets normally never reach the Worker (see `assets` in wrangler.jsonc);
// this is a belt-and-braces fallback for environments without the binding.
app.get("*", (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.notFound();
});

export default app;
