import { MapPinPlusIcon, MessageSquarePlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCoordinates, type Coordinates } from "@shared/schemas/geo";
import type { ContactRef } from "@shared/types";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { useReverseGeocode } from "@/lib/queries/map";
import type { MapMenuTarget } from "./MapView";

const WIDTH = 256;
const HEIGHT = 132;

/**
 * The menu a right-click on a map opens: log an interaction at that spot, or
 * make it an address. Rendered inside the map frame (MapView `children`), so
 * it is positioned in map pixels and flips away from the edges. Dismissed by
 * Escape, the close button, or a plain click on the map (MapView reports that
 * as a null target).
 */
export function MapContextMenu({
  target,
  contact,
  onClose,
  onLogInteraction,
  onAddAddress,
}: {
  target: MapMenuTarget | null;
  /** When the map belongs to one contact, the address action needs no picker. */
  contact?: ContactRef;
  onClose: () => void;
  onLogInteraction: (coordinates: Coordinates, place: string | null) => void;
  onAddAddress: (contactId: string, coordinates: Coordinates, place: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const reverse = useReverseGeocode(target?.coordinates ?? null);
  const place = reverse.data?.result?.label ?? null;

  useEffect(() => {
    setPicking(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  const left = target.x + WIDTH > target.width ? Math.max(0, target.x - WIDTH) : target.x;
  const top = target.y + HEIGHT > target.height ? Math.max(0, target.y - HEIGHT) : target.y;
  const item = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground";

  return (
    <div className="absolute z-10 rounded-md border bg-popover p-1 text-popover-foreground shadow-md" style={{ left, top, width: WIDTH }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-start gap-1 px-2 py-1 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={place ?? undefined}>
          {place ?? (reverse.isPending ? "Finding the place…" : formatCoordinates(target.coordinates))}
        </span>
        <button type="button" aria-label="Close" className="shrink-0 rounded-sm hover:text-foreground" onClick={onClose}>
          <XIcon className="size-3.5" />
        </button>
      </div>
      <button type="button" role="menuitem" className={item} onClick={() => onLogInteraction(target.coordinates, place)}>
        <MessageSquarePlusIcon className="size-4" /> Log an interaction here
      </button>
      {contact ? (
        <button type="button" role="menuitem" className={item} onClick={() => onAddAddress(contact.id, target.coordinates, place)}>
          <MapPinPlusIcon className="size-4" /> Add as {contact.displayName}’s address
        </button>
      ) : picking ? (
        <div className="p-1">
          <ContactPicker value={null} placeholder="Whose address is this?" onSelect={(c) => onAddAddress(c.id, target.coordinates, place)} />
        </div>
      ) : (
        <button type="button" role="menuitem" className={item} onClick={() => setPicking(true)}>
          <MapPinPlusIcon className="size-4" /> Add as someone’s address…
        </button>
      )}
    </div>
  );
}
