import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { aiSettingsUpdateSchema } from "@shared/schemas/ai-settings";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { clearProvider, mergeProvider, saveProvider, settingsOut, testProvider } from "../services/ai-settings";
import { testFetch } from "../services/ask/provider";

/** Admin-only provider settings for Ask. Secrets are write-only: responses report presence, never values. */
const app = new Hono<AppEnv>();

app.get("/ai/settings", requireAdmin, async (c) => c.json(await settingsOut(c.get("db"), c.env)));

app.put("/ai/settings", requireAdmin, zValidator("json", aiSettingsUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  await saveProvider(db, c.env, c.req.valid("json"));
  return c.json(await settingsOut(db, c.env));
});

app.delete("/ai/settings", requireAdmin, async (c) => {
  const db = c.get("db");
  await clearProvider(db);
  return c.json(await settingsOut(db, c.env));
});

/** Try the submitted (unsaved) settings; omitted secrets fall back to the active ones. */
app.post("/ai/settings/test", requireAdmin, zValidator("json", aiSettingsUpdateSchema, validationHook), async (c) => {
  const provider = await mergeProvider(c.get("db"), c.env, c.req.valid("json"));
  return c.json(await testProvider(provider, testFetch(c.env)));
});

export default app;
