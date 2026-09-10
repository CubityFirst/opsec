import { MapIcon, MapPinIcon, MapPinPlusIcon, PencilIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { Coordinates } from "@shared/schemas/geo";
import type { ContactMethodOut, ContactRef } from "@shared/types";
import { ContactMethodDialog } from "@/components/contacts/ContactMethodDialog";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useMapPins } from "@/lib/queries/map";
import { useDeleteMethod } from "@/lib/queries/methods";
import { MapContextMenu } from "./MapContextMenu";
import type { MapMenuTarget } from "./MapView";

const MapView = lazy(() => import("./MapView").then((m) => ({ default: m.MapView })));

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type AddressDialog = { open: boolean; method?: ContactMethodOut; initialValues?: { value?: string | null; coordinates?: Coordinates | null } };

/**
 * Overview card for everything about where a contact is: their addresses (add,
 * edit, remove, show on map) and a map of those addresses plus the interactions
 * they were part of that have a place. Right-click the map logs or pins
 * something at that spot.
 */
export function ContactLocationsCard({ contact, addresses }: { contact: ContactRef; addresses: ContactMethodOut[] }) {
  const pins = useMapPins({ contactId: contact.id });
  const items = pins.data?.items ?? [];
  const deleteMethod = useDeleteMethod(contact.id);
  const [menu, setMenu] = useState<MapMenuTarget | null>(null);
  const [logAt, setLogAt] = useState<{ coordinates: Coordinates; place: string | null } | null>(null);
  const [address, setAddress] = useState<AddressDialog>({ open: false });

  const onDelete = async (m: ContactMethodOut) => {
    try {
      await deleteMethod.mutateAsync(m.id);
      toast.success("Address removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Locations</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddress({ open: true })}>
            <MapPinPlusIcon /> Add address
          </Button>
          {items.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/map?contactId=${contact.id}`}>
                <MapIcon /> Open map
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {addresses.length > 0 && (
          <ul className="divide-y">
            {addresses.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className="flex w-3.5 shrink-0 items-center justify-center" aria-hidden={!m.isPrimary}>
                  {m.isPrimary && <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-label="Primary" />}
                </span>
                <div className="w-20 shrink-0 truncate text-xs text-muted-foreground">{m.label ?? "Address"}</div>
                <div className="min-w-0 flex-1 text-sm whitespace-pre-line">{m.value}</div>
                {m.coordinates && (
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Show on map" title="Show on map">
                    <Link to={`/map?focus=method:${m.id}`}>
                      <MapPinIcon />
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" aria-label="Edit address" onClick={() => setAddress({ open: true, method: m })}>
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove address" onClick={() => void onDelete(m)}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {pins.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : pins.isError ? (
          <p className="text-sm text-destructive">{errorMessage(pins.error)}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {addresses.length === 0 ? "No places yet. Add an address, or log an interaction with a spot on the map." : "Nothing on the map yet. Edit an address to pin it, or log an interaction with a spot."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <MapView pins={items} scrollWheelZoom="focus" fitKey={contact.id} className="h-56" onContextMenu={setMenu}>
                <MapContextMenu
                  target={menu}
                  contact={contact}
                  onClose={() => setMenu(null)}
                  onLogInteraction={(coordinates, place) => {
                    setMenu(null);
                    setLogAt({ coordinates, place });
                  }}
                  onAddAddress={(_id, coordinates, place) => {
                    setMenu(null);
                    setAddress({ open: true, initialValues: { value: place, coordinates } });
                  }}
                />
              </MapView>
            </Suspense>
            <p className="text-xs text-muted-foreground">
              {[pins.data.counts.contacts > 0 && plural(pins.data.counts.contacts, "address"), pins.data.counts.interactions > 0 && plural(pins.data.counts.interactions, "interaction")]
                .filter(Boolean)
                .join(" · ")}
              {" · "}Right-click the map to log or pin something there.
            </p>
          </div>
        )}
      </CardContent>

      <InteractionDialog
        open={!!logAt}
        onOpenChange={(o) => !o && setLogAt(null)}
        initialParticipants={[contact]}
        initialValues={{ coordinates: logAt?.coordinates ?? null, location: logAt?.place ?? null }}
      />
      <ContactMethodDialog
        contactId={contact.id}
        method={address.method}
        initialType="address"
        initialValues={address.initialValues}
        open={address.open}
        onOpenChange={(o) => setAddress((s) => ({ ...s, open: o }))}
      />
    </Card>
  );
}
