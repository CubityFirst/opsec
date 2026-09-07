import { z } from "zod";
import { boolQuery, idSchema } from "./common";

/** A WGS-84 position, optionally with the radius (metres) of the area it stands for when the spot is only roughly known. */
export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** "Somewhere within this many metres": omitted means an exact spot. */
  radius: z.number().min(1).max(5_000_000).optional(),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

/** "250 m", "1.5 km", "12 km". */
export function formatRadius(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1).replace(/\.0$/, "")} km`;
  return `${Math.round(metres / 1000)} km`;
}

/** Round to two significant figures so derived radii read as "about 12 km", not 11,834 m. */
export function roundRadius(metres: number): number {
  if (metres <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(metres) - 1);
  return Math.round(metres / magnitude) * magnitude;
}

/**
 * Coordinates on a create/patch body: omitted = untouched (create: none),
 * null = clear, object = set. Nesting the pair keeps "both or neither" free.
 */
export const coordinatesField = coordinatesSchema.nullish().transform((v) => v ?? null);

export function formatCoordinates(c: Coordinates): string {
  return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}${c.radius ? ` ±${formatRadius(c.radius)}` : ""}`;
}

/** `GET /api/geocode?q=` */
export const geocodeQuerySchema = z.object({ q: z.string().trim().min(3).max(200) });
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;

/** `GET /api/geocode/reverse?lat=&lng=` */
export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type ReverseGeocodeQuery = z.infer<typeof reverseGeocodeQuerySchema>;

/** `GET /api/map/pins`. With `contactId`, only that contact's addresses and the interactions they took part in. */
export const mapPinsQuerySchema = z.object({
  contactId: idSchema.optional(),
  /** Unscoped only: also pin archived contacts' addresses. */
  archived: boolQuery.optional().default(false),
});
export type MapPinsQuery = z.infer<typeof mapPinsQuerySchema>;
