import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { timelineQuerySchema } from "@shared/schemas/timeline";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { timeline } from "../services/timeline";

/** Cross-contact timeline: what happened between two days (see services/timeline.ts). */
const app = new Hono<AppEnv>();

app.get("/timeline", zValidator("query", timelineQuerySchema, validationHook), async (c) => c.json(await timeline(c.get("db"), c.req.valid("query"))));

export default app;
