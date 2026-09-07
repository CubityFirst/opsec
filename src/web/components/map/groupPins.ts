import type { Coordinates } from "@shared/schemas/geo";
import type { MapPin } from "@shared/types";

export interface PinGroup {
  key: string;
  coordinates: Coordinates;
  pins: MapPin[];
}

/** The marker a pin belongs to: its spot to about a metre. */
export function groupKey(c: Coordinates): string {
  return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
}

/**
 * Pins at the same spot (to about a metre) become one marker, so a household
 * at one address is a single face with a count instead of a stack of identical
 * markers. Contacts sort before interactions inside a group.
 */
export function groupPins(pins: MapPin[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const pin of pins) {
    const key = groupKey(pin.coordinates);
    let g = groups.get(key);
    if (!g) {
      g = { key, coordinates: pin.coordinates, pins: [] };
      groups.set(key, g);
    }
    g.pins.push(pin);
  }
  for (const g of groups.values()) g.pins.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "contact" ? -1 : 1));
  return [...groups.values()];
}
