import { useQuery } from "@tanstack/react-query";
import type { Coordinates, MapPinsQuery } from "@shared/schemas/geo";
import type { GeocodeSearchResult, MapPinsResult, ReverseGeocodeResult } from "@shared/types";
import { api, toQuery } from "../api";
import { geocodeKeys, mapKeys } from "./keys";

/** Every pin on the map, or one contact's pins with `contactId`. */
export function useMapPins(q: Partial<MapPinsQuery> = {}) {
  const params = { contactId: q.contactId, archived: q.archived ? true : undefined };
  return useQuery({
    queryKey: mapKeys.pins(params),
    queryFn: () => api.get<MapPinsResult>(`/api/map/pins${toQuery(params)}`),
  });
}

/** Address search through the Worker. Runs once per distinct query (results never go stale). */
export function useGeocode(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: geocodeKeys.search(query),
    queryFn: () => api.get<GeocodeSearchResult>(`/api/geocode${toQuery({ q: query })}`),
    enabled: query.length >= 3,
    staleTime: Infinity,
    retry: false,
  });
}

/** The place at a position, for filling in an address after "use my location" or a map click. */
export function useReverseGeocode(c: Coordinates | null) {
  return useQuery({
    queryKey: geocodeKeys.reverse(c?.lat ?? 0, c?.lng ?? 0),
    queryFn: () => api.get<ReverseGeocodeResult>(`/api/geocode/reverse${toQuery({ lat: c!.lat, lng: c!.lng })}`),
    enabled: !!c,
    staleTime: Infinity,
    retry: false,
  });
}
