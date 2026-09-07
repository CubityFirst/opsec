import { roundRadius } from "@shared/schemas/geo";
import type { GeocodeResult } from "@shared/types";
import type { AppVars } from "../env";
import { ApiError } from "../lib/errors";

/**
 * Address lookup through OpenStreetMap's Nominatim, the only place the app
 * talks to it. The browser never calls Nominatim itself (the CSP allows
 * connections to this origin only), searches are on demand rather than per
 * keystroke, and responses are cached for a week, which together keep a
 * personal instance well inside Nominatim's usage policy (identifying
 * User-Agent, at most one request per second).
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "opsec (+https://github.com/CubityFirst/opsec)";
const SEARCH_LIMIT = 5;
const TIMEOUT_MS = 5000;
const CACHE_TTL_S = 7 * 24 * 60 * 60;

type Env = Pick<AppVars, "GEOCODE_FAKE_UPSTREAM">;

/** Test hook: when GEOCODE_FAKE_UPSTREAM=1, Nominatim calls go to a fetch installed by tests on globalThis. */
function upstreamFetch(env: Env): { fetch: typeof fetch; fake: boolean } {
  if (env.GEOCODE_FAKE_UPSTREAM !== "1") return { fetch, fake: false };
  return {
    fake: true,
    fetch: (input, init) => {
      const handler = (globalThis as { __geocodeFakeUpstream?: typeof fetch }).__geocodeFakeUpstream;
      if (!handler) return Promise.resolve(new Response("no fake upstream installed", { status: 500 }));
      return handler(input, init);
    },
  };
}

function unavailable(): ApiError {
  return new ApiError(502, "geocode_unavailable", "Address lookup is unavailable right now");
}

async function nominatim(env: Env, path: "/search" | "/reverse", params: Record<string, string>, acceptLanguage: string | undefined): Promise<unknown> {
  const url = new URL(NOMINATIM + path);
  url.searchParams.set("format", "jsonv2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Language lives in the URL so the cache key varies by it (Cache API keys ignore request headers).
  if (acceptLanguage) url.searchParams.set("accept-language", acceptLanguage.slice(0, 100));
  const { fetch: doFetch, fake } = upstreamFetch(env);

  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cache = fake ? null : await openCache();
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return await hit.json();
    } catch {
      /* cache is best effort */
    }
  }

  let res: Response;
  try {
    res = await doFetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  if (!res.ok) throw unavailable();
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw unavailable();
  }
  if (cache) {
    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "Cache-Control": `s-maxage=${CACHE_TTL_S}` } }),
      );
    } catch {
      /* cache is best effort */
    }
  }
  return data;
}

async function openCache(): Promise<Cache | null> {
  try {
    return (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    return null;
  }
}

function toResult(raw: unknown): GeocodeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  const label = typeof r.display_name === "string" ? r.display_name : "";
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const kind = typeof r.type === "string" ? r.type : typeof r.category === "string" ? r.category : null;
  return { label, lat, lng, kind, radius: radiusOf(r.boundingbox) };
}

/** A house or shop is a spot; anything smaller than this across counts as exact. */
const POINT_LIKE_M = 150;

/** Half the diagonal of Nominatim's bounding box ([south, north, west, east]), rounded, or null for point-like results. */
function radiusOf(box: unknown): number | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [s, n, w, e] = box.map(Number);
  if (![s, n, w, e].every(Number.isFinite)) return null;
  const metres = haversine(s!, w!, n!, e!) / 2;
  return metres >= POINT_LIKE_M ? roundRadius(metres) : null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Places matching free text, best first. */
export async function searchPlaces(env: Env, q: string, acceptLanguage?: string): Promise<GeocodeResult[]> {
  const data = await nominatim(env, "/search", { q, limit: String(SEARCH_LIMIT) }, acceptLanguage);
  if (!Array.isArray(data)) throw unavailable();
  return data.map(toResult).filter((x): x is GeocodeResult => x !== null);
}

/** The place at a position, or null where there is nothing to name (open sea). */
export async function reversePlace(env: Env, lat: number, lng: number, acceptLanguage?: string): Promise<GeocodeResult | null> {
  const data = await nominatim(env, "/reverse", { lat: String(lat), lon: String(lng) }, acceptLanguage);
  if (!data || typeof data !== "object") throw unavailable();
  if ("error" in (data as Record<string, unknown>)) return null;
  return toResult(data);
}
