import { XIcon } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Coordinates } from "@shared/schemas/geo";
import type { MapPin } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { ContactMethodDialog } from "@/components/contacts/ContactMethodDialog";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { MapContextMenu } from "@/components/map/MapContextMenu";
import type { MapMenuTarget } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { useContact } from "@/lib/queries/contacts";
import { useMapPins } from "@/lib/queries/map";

const MapView = lazy(() => import("@/components/map/MapView").then((m) => ({ default: m.MapView })));

type Layers = { contacts: boolean; interactions: boolean };
const LAYERS_KEY = "opsec:map:layers";

function loadLayers(): Layers {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Layers>;
      return { contacts: v.contacts !== false, interactions: v.interactions !== false };
    }
  } catch {
    /* no storage */
  }
  return { contacts: true, interactions: true };
}

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const contactId = params.get("contactId") ?? undefined;
  const focus = params.get("focus");
  const archived = params.get("archived") === "true";
  const [layers, setLayers] = useState<Layers>(loadLayers);
  const [menu, setMenu] = useState<MapMenuTarget | null>(null);
  const [logAt, setLogAt] = useState<{ coordinates: Coordinates; place: string | null } | null>(null);
  const [addressAt, setAddressAt] = useState<{ contactId: string; coordinates: Coordinates; place: string | null } | null>(null);
  const pins = useMapPins({ contactId, archived });
  const contact = useContact(contactId);

  useEffect(() => {
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
    } catch {
      /* no storage */
    }
  }, [layers]);

  const shown = useMemo(() => {
    const items = pins.data?.items ?? [];
    // The focused pin always shows, whatever the layer toggles say.
    return items.filter((p: MapPin) => p.id === focus || (p.kind === "contact" ? layers.contacts : layers.interactions));
  }, [pins.data, layers, focus]);

  const counts = pins.data?.counts;
  const clearFocus = () =>
    setParams(
      (prev) => {
        prev.delete("focus");
        return prev;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
          <p className="text-sm text-muted-foreground">Where the people in your life live, and where things happened. Right-click (or long-press) a spot to log or pin something there.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="layer-contacts" checked={layers.contacts} onCheckedChange={(v) => setLayers((l) => ({ ...l, contacts: v }))} />
            <Label htmlFor="layer-contacts">Contacts{counts ? ` (${counts.contacts})` : ""}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="layer-interactions" checked={layers.interactions} onCheckedChange={(v) => setLayers((l) => ({ ...l, interactions: v }))} />
            <Label htmlFor="layer-interactions">Interactions{counts ? ` (${counts.interactions})` : ""}</Label>
          </div>
        </div>
      </div>

      {contactId && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Places for</span>
          {contact.data ? (
            <Link to={`/contacts/${contactId}`} className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 font-medium hover:bg-muted">
              <ContactAvatar contact={contact.data} className="size-5" />
              {contact.data.displayName}
            </Link>
          ) : (
            <Skeleton className="h-6 w-28" />
          )}
          <Button asChild variant="ghost" size="xs">
            <Link to="/map">
              <XIcon /> Show everyone
            </Link>
          </Button>
        </div>
      )}

      <div className="relative">
        <Suspense fallback={<Skeleton className="h-[calc(100svh-15rem)] min-h-80 w-full rounded-lg" />}>
          <MapView pins={shown} focusId={focus} onFocusHandled={clearFocus} fitKey={contactId ?? "all"} className="h-[calc(100svh-15rem)] min-h-80" onContextMenu={setMenu}>
            <MapContextMenu
              target={menu}
              contact={contactId ? contact.data : undefined}
              onClose={() => setMenu(null)}
              onLogInteraction={(coordinates, place) => {
                setMenu(null);
                setLogAt({ coordinates, place });
              }}
              onAddAddress={(id, coordinates, place) => {
                setMenu(null);
                setAddressAt({ contactId: id, coordinates, place });
              }}
            />
          </MapView>
        </Suspense>
        {pins.isError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="rounded-md border bg-background px-3 py-2 text-sm text-destructive shadow">{errorMessage(pins.error)}</p>
          </div>
        )}
        {pins.data && pins.data.items.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <p className="max-w-sm rounded-md border bg-background px-3 py-2 text-center text-sm text-muted-foreground shadow">
              Nothing on the map yet. Pin a contact's address from their page, or log an interaction with a spot on the map.
            </p>
          </div>
        )}
        {pins.data && pins.data.items.length > 0 && shown.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <p className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow">Both layers are off.</p>
          </div>
        )}
      </div>

      <InteractionDialog
        open={!!logAt}
        onOpenChange={(o) => !o && setLogAt(null)}
        initialParticipants={contactId && contact.data ? [contact.data] : []}
        initialValues={{ coordinates: logAt?.coordinates ?? null, location: logAt?.place ?? null }}
      />
      <ContactMethodDialog
        contactId={addressAt?.contactId ?? ""}
        initialType="address"
        initialValues={{ value: addressAt?.place, coordinates: addressAt?.coordinates ?? null }}
        open={!!addressAt}
        onOpenChange={(o) => !o && setAddressAt(null)}
      />
    </div>
  );
}
