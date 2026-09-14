import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { brandingUpdateSchema } from "@shared/schemas/branding";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { clearBranding, resolveBranding, saveBranding } from "../services/branding";

/**
 * What the instance calls itself. Reading is public because the sign-in page
 * wears the branding before there is a session; only admins can change it.
 */
const app = new Hono<AppEnv>();

app.get("/branding", async (c) => c.json(await resolveBranding(c.get("db"))));

app.put("/branding", requireAdmin, zValidator("json", brandingUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  await saveBranding(db, c.req.valid("json"));
  return c.json(await resolveBranding(db));
});

app.delete("/branding", requireAdmin, async (c) => {
  const db = c.get("db");
  await clearBranding(db);
  return c.json(await resolveBranding(db));
});

export default app;
