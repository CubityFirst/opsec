import { MapIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Link } from "react-router";
import type { Coordinates } from "@shared/schemas/geo";
import type { ContactRef } from "@shared/types";
import { ContactMethodDialog } from "@/components/contacts/ContactMethodDialog";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useMapPins } from "@/lib/queries/map";
import { MapContextMenu } from "./MapContextMenu";
import type { MapMenuTarget } from "./MapView";

const MapView = lazy(() => import("./MapView").then((m) => ({ default: m.MapView })));

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Overview card: the contact's pinned addresses and the interactions they were part of that have a place. Right-click logs or pins something at that spot. */
export function ContactMapCard({ contact }: { contact: ContactRef }) {
  const pins = useMapPins({ contactId: contact.id });
  const items = pins.data?.items ?? [];
  const [menu, setMenu] = useState<MapMenuTarget | null>(null);
  const [logAt, setLogAt] = useState<{ coordinates: Coordinates; place: string | null } | null>(null);
  const [addressAt, setAddressAt] = useState<{ coordinates: Coordinates; place: string | null } | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Map</CardTitle>
        {items.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/map?contactId=${contact.id}`}>
              <MapIcon /> Open map
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {pins.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : pins.isError ? (
          <p className="text-sm text-destructive">{errorMessage(pins.error)}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No places yet. Pin an address, or log an interaction with a spot on the map.</p>
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
                    setAddressAt({ coordinates, place });
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
        initialType="address"
        initialValues={{ value: addressAt?.place, coordinates: addressAt?.coordinates ?? null }}
        open={!!addressAt}
        onOpenChange={(o) => !o && setAddressAt(null)}
      />
    </Card>
  );
}
