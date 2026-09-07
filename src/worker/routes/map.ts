import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { geocodeQuerySchema, mapPinsQuerySchema, reverseGeocodeQuerySchema } from "@shared/schemas/geo";
import type { GeocodeSearchResult, MapPinsResult, ReverseGeocodeResult } from "@shared/types";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { reversePlace, searchPlaces } from "../services/geocode";
import { listMapPins } from "../services/map";

const app = new Hono<AppEnv>();

/** Every marker for the map; `?contactId=` scopes it to one contact, `?archived=true` adds archived contacts. */
app.get("/map/pins", zValidator("query", mapPinsQuerySchema, validationHook), async (c) => {
  const result: MapPinsResult = await listMapPins(c.get("db"), c.req.valid("query"));
  return c.json(result);
});

/** Address search (forward geocoding) through the Worker; see services/geocode.ts. */
app.get("/geocode", zValidator("query", geocodeQuerySchema, validationHook), async (c) => {
  const items = await searchPlaces(c.env, c.req.valid("query").q, c.req.header("accept-language"));
  const result: GeocodeSearchResult = { items };
  return c.json(result);
});

/** The place at a position (reverse geocoding). */
app.get("/geocode/reverse", zValidator("query", reverseGeocodeQuerySchema, validationHook), async (c) => {
  const { lat, lng } = c.req.valid("query");
  const result: ReverseGeocodeResult = { result: await reversePlace(c.env, lat, lng, c.req.header("accept-language")) };
  return c.json(result);
});

export default app;
