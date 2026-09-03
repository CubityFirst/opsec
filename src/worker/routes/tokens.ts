import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { apiTokenCreateSchema } from "@shared/schemas/token";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import { listTokens, mintToken, revokeToken } from "../services/tokens";

/**
 * Personal API tokens for MCP clients and scripts. Managed only from a browser
 * session (a token cannot mint or revoke tokens), and each user sees their own.
 */
const app = new Hono<AppEnv>();

app.use("/tokens/*", async (c, next) => {
  if (c.get("tokenScope")) throw ApiError.forbidden("Manage API tokens from the app, not with a token");
  await next();
});
app.use("/tokens", async (c, next) => {
  if (c.get("tokenScope")) throw ApiError.forbidden("Manage API tokens from the app, not with a token");
  await next();
});

app.get("/tokens", async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return c.json({ items: await listTokens(c.get("db"), user.sub) });
});

app.post("/tokens", zValidator("json", apiTokenCreateSchema, validationHook), async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return c.json(await mintToken(c.get("db"), user, c.req.valid("json")), 201);
});

app.delete("/tokens/:id", async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  if (!(await revokeToken(c.get("db"), user.sub, c.req.param("id")))) throw ApiError.notFound("Token");
  return c.body(null, 204);
});

export default app;
