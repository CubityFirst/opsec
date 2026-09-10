import { zValidator } from "@hono/zod-validator";
import { Hono, type MiddlewareHandler } from "hono";
import { calendarFeedCreateSchema, calendarFeedUpdateSchema } from "@shared/schemas/calendar";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import { createFeed, deleteFeed, listFeeds, rotateFeedKey, updateFeed } from "../services/calendar";

/**
 * iCalendar subscription feeds (Account → Calendar feeds). Managed only from a
 * browser session, like API tokens, and each user sees their own. The feed
 * itself is served by routes/calendar.ts outside /api.
 */
const app = new Hono<AppEnv>();

const noTokens: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("tokenScope")) throw ApiError.forbidden("Manage calendar feeds from the app, not with a token");
  await next();
};
app.use("/calendar-feeds", noTokens);
app.use("/calendar-feeds/*", noTokens);

function subOf(user: AppEnv["Variables"]["user"]): string {
  if (!user) throw ApiError.unauthorized();
  return user.sub;
}

app.get("/calendar-feeds", async (c) => c.json({ items: await listFeeds(c.get("db"), subOf(c.get("user"))) }));

app.post("/calendar-feeds", zValidator("json", calendarFeedCreateSchema, validationHook), async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return c.json(await createFeed(c.get("db"), user, c.req.valid("json")), 201);
});

app.patch("/calendar-feeds/:id", zValidator("json", calendarFeedUpdateSchema, validationHook), async (c) => {
  const out = await updateFeed(c.get("db"), subOf(c.get("user")), c.req.param("id"), c.req.valid("json"));
  if (!out) throw ApiError.notFound("Calendar feed");
  return c.json(out);
});

app.post("/calendar-feeds/:id/rotate", async (c) => {
  const out = await rotateFeedKey(c.get("db"), subOf(c.get("user")), c.req.param("id"));
  if (!out) throw ApiError.notFound("Calendar feed");
  return c.json(out);
});

app.delete("/calendar-feeds/:id", async (c) => {
  if (!(await deleteFeed(c.get("db"), subOf(c.get("user")), c.req.param("id")))) throw ApiError.notFound("Calendar feed");
  return c.body(null, 204);
});

export default app;
