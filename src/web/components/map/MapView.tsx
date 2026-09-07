import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Coordinates } from "@shared/schemas/geo";
import type { MapPin } from "@shared/types";
import { cn } from "@/lib/utils";
import { groupKey, groupPins, type PinGroup } from "./groupPins";
import { PinMarker, Teardrop } from "./PinMarker";
import { PinPopup } from "./PinPopup";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const ICON = { className: "opsec-pin", iconSize: [40, 48] as [number, number], iconAnchor: [20, 46] as [number, number], popupAnchor: [0, -44] as [number, number] };

/** About a metre: enough for a front door, short enough to read. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

interface Entry {
  group: PinGroup;
  marker: L.Marker;
  iconEl: HTMLElement;
  popupEl: HTMLElement;
}

/** Where a right-click (or long press) landed: the spot, and its pixel position inside the map for placing a menu. */
export interface MapMenuTarget {
  coordinates: Coordinates;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The only component that touches Leaflet. Markers and popups are DOM
 * elements React renders into through portals, so avatars, icons and router
 * links work inside the map with no HTML strings.
 */
export function MapView({
  pins,
  focusId,
  onFocusHandled,
  editable,
  scrollWheelZoom = true,
  fitKey,
  className,
  onContextMenu,
  children,
}: {
  pins: MapPin[];
  /** A pin id to centre on and open; call `onFocusHandled` once done. */
  focusId?: string | null;
  onFocusHandled?: () => void;
  /** Pick-a-spot mode: click places (or moves) a draggable marker. */
  editable?: { value: Coordinates | null; onChange: (c: Coordinates) => void };
  /** true: always; false: never; "focus": only after the map has been clicked, so a page scroll over an embedded map still scrolls the page. */
  scrollWheelZoom?: boolean | "focus";
  /** Changing it fits the view to the pins again (e.g. a different contact). */
  fitKey?: string;
  className?: string;
  /** Right-click / long-press on the map; called with null when a plain click should dismiss whatever the menu showed. Suppresses the browser's own menu. */
  onContextMenu?: (target: MapMenuTarget | null) => void;
  /** Overlays (menus) rendered above the map inside its frame. */
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const areasRef = useRef<L.LayerGroup | null>(null);
  /** Area circles by marker key, so the open marker's areas can be highlighted. */
  const areaByGroupRef = useRef<Map<string, L.Circle[]>>(new Map());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const entriesRef = useRef<Record<string, Entry>>({});
  const [editEl, setEditEl] = useState<HTMLElement | null>(null);
  const fittedFor = useRef<string | undefined>(undefined);
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const focusHandledRef = useRef(onFocusHandled);
  focusHandledRef.current = onFocusHandled;
  const contextMenuRef = useRef(onContextMenu);
  contextMenuRef.current = onContextMenu;

  // Create and destroy the map inside one effect: StrictMode runs it twice in
  // development, and a container can only be initialised once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: scrollWheelZoom === true, zoomControl: true });
    if (scrollWheelZoom === "focus") {
      map.on("focus", () => map.scrollWheelZoom.enable());
      map.on("blur", () => map.scrollWheelZoom.disable());
    }
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.setView([30, 0], 2);
    const areas = L.layerGroup().addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    areasRef.current = areas;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const onClick = (e: L.LeafletMouseEvent) => {
      editableRef.current?.onChange({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
      contextMenuRef.current?.(null);
    };
    map.on("click", onClick);
    // Registering the listener also makes Leaflet suppress the browser's own context menu.
    if (onContextMenu) {
      map.on("contextmenu", (e: L.LeafletMouseEvent) => {
        const size = map.getSize();
        contextMenuRef.current?.({ coordinates: { lat: round(e.latlng.lat), lng: round(e.latlng.lng) }, x: e.containerPoint.x, y: e.containerPoint.y, width: size.x, height: size.y });
      });
    }
    return () => {
      ro.disconnect();
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      areasRef.current = null;
      entriesRef.current = {};
      // A fresh map (StrictMode remount in development) must fit again.
      fittedFor.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One marker per spot; the elements are filled by the portals below. Markers
  // whose pins have not changed are kept, so an open popup survives a refetch
  // or a re-render of the pin list.
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    const current = entriesRef.current;
    const next: Record<string, Entry> = {};
    const groups = groupPins(pins);
    for (const group of groups) {
      const prev = current[group.key];
      if (prev && prev.group.pins.length === group.pins.length && prev.group.pins.every((p, i) => p.id === group.pins[i]!.id)) {
        next[group.key] = { ...prev, group };
        continue;
      }
      prev?.marker.remove();
      const iconEl = document.createElement("div");
      const popupEl = document.createElement("div");
      const marker = L.marker([group.coordinates.lat, group.coordinates.lng], { icon: L.divIcon({ ...ICON, html: iconEl }), riseOnHover: true })
        .bindPopup(popupEl, { minWidth: 240, maxWidth: 320 })
        .addTo(layer);
      // The open marker is the highlighted one; markers survive re-renders, so the handlers do too.
      marker.on("popupopen", () => setActiveKey(group.key));
      marker.on("popupclose", () => setActiveKey((k) => (k === group.key ? null : k)));
      next[group.key] = { group, marker, iconEl, popupEl };
    }
    for (const [key, entry] of Object.entries(current)) if (!next[key]) entry.marker.remove();
    entriesRef.current = next;
    setEntries(next);
    // Approximate pins draw their area as a circle under the markers.
    const areas = areasRef.current;
    if (areas) {
      areas.clearLayers();
      const byGroup = new Map<string, L.Circle[]>();
      for (const pin of pins) {
        if (!pin.coordinates.radius) continue;
        const circle = L.circle([pin.coordinates.lat, pin.coordinates.lng], { radius: pin.coordinates.radius, className: `opsec-area opsec-area-${pin.kind}`, weight: 1.5, interactive: false }).addTo(areas);
        const key = groupKey(pin.coordinates);
        byGroup.set(key, [...(byGroup.get(key) ?? []), circle]);
      }
      areaByGroupRef.current = byGroup;
    }
    // Fit the view whenever the set of places changes (first load, a different contact, a moved pin).
    const signature = `${fitKey ?? ""}|${pins.map((p) => `${p.coordinates.lat},${p.coordinates.lng},${p.coordinates.radius ?? 0}`).join(";")}`;
    if (groups.length > 0 && fittedFor.current !== signature) {
      fittedFor.current = signature;
      const bounds = L.latLngBounds(groups.map((g) => [g.coordinates.lat, g.coordinates.lng] as [number, number]));
      for (const pin of pins) if (pin.coordinates.radius) bounds.extend(L.latLng(pin.coordinates.lat, pin.coordinates.lng).toBounds(pin.coordinates.radius * 2));
      // Not animated: Leaflet drops any setView issued while a zoom animation runs, which would swallow a focus request.
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
    }
  }, [pins, fitKey]);

  // Highlight: the open marker rises above its neighbours and its areas turn solid.
  useEffect(() => {
    for (const [key, entry] of Object.entries(entries)) entry.marker.setZIndexOffset(key === activeKey ? 500 : 0);
    for (const [key, circles] of areaByGroupRef.current) for (const c of circles) c.getElement()?.classList.toggle("opsec-area-active", key === activeKey);
  }, [activeKey, entries]);

  useEffect(() => {
    if (!focusId || !mapRef.current) return;
    const entry = Object.values(entries).find((e) => e.group.pins.some((p) => p.id === focusId));
    if (!entry) return;
    mapRef.current.setView(entry.marker.getLatLng(), Math.max(mapRef.current.getZoom(), 16));
    entry.marker.openPopup();
    focusHandledRef.current?.();
  }, [focusId, entries]);

  // Pick-a-spot marker: draggable, and the view follows it when it is placed off screen.
  const editLat = editable?.value?.lat;
  const editLng = editable?.value?.lng;
  const editRadius = editable?.value?.radius ?? 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || editLat === undefined || editLng === undefined) {
      setEditEl(null);
      return;
    }
    const el = document.createElement("div");
    const latlng = L.latLng(editLat, editLng);
    const marker = L.marker(latlng, { icon: L.divIcon({ ...ICON, html: el }), draggable: true, zIndexOffset: 1000 }).addTo(map);
    // Dragging keeps the chosen precision; only the spot moves.
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      editableRef.current?.onChange({ lat: round(p.lat), lng: round(p.lng), ...(editRadius ? { radius: editRadius } : {}) });
    });
    const area = editRadius ? L.circle(latlng, { radius: editRadius, className: "opsec-area opsec-area-edit", weight: 1.5, interactive: false }).addTo(map) : null;
    setEditEl(el);
    if (fittedFor.current === undefined) {
      fittedFor.current = "";
      if (editRadius) map.fitBounds(latlng.toBounds(editRadius * 2), { padding: [20, 20], animate: false });
      else map.setView(latlng, 15);
    } else if (!map.getBounds().contains(latlng)) {
      map.panTo(latlng);
    }
    return () => {
      marker.remove();
      area?.remove();
    };
  }, [editLat, editLng, editRadius]);

  return (
    <div className={cn("relative overflow-hidden rounded-lg border", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {Object.values(entries).map((e) => (
        <span key={e.group.key}>
          {createPortal(<PinMarker group={e.group} active={e.group.key === activeKey} />, e.iconEl)}
          {createPortal(<PinPopup group={e.group} />, e.popupEl)}
        </span>
      ))}
      {editEl &&
        createPortal(
          <Teardrop tone="edit" title="Drag to adjust">
            <span className="size-2.5 rounded-full bg-current" />
          </Teardrop>,
          editEl,
        )}
      {children}
    </div>
  );
}
