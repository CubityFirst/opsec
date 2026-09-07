import { MapPinOffIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { formatRadius } from "@shared/schemas/geo";
import type { MapPin } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, formatDate } from "@/lib/format";
import { INTERACTION_ICONS } from "@/lib/interaction-icons";
import { useDeleteInteraction, useUpdateInteraction } from "@/lib/queries/interactions";
import { useUpdateMethod } from "@/lib/queries/methods";
import type { PinGroup } from "./groupPins";

function ContactPinRow({ pin }: { pin: Extract<MapPin, { kind: "contact" }> }) {
  const update = useUpdateMethod(pin.contact.id);
  const unpin = async () => {
    try {
      await update.mutateAsync({ methodId: pin.methodId, input: { coordinates: null } });
      toast.success("Unpinned; the address is kept");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="flex items-start gap-2">
      <ContactAvatar contact={pin.contact} className="size-7" />
      <div className="min-w-0 flex-1">
        <Link to={`/contacts/${pin.contact.id}`} className="font-medium hover:underline">
          {pin.contact.displayName}
        </Link>
        {pin.contact.deceased && <span className="ml-1 text-xs text-muted-foreground">(deceased)</span>}
        <div className="text-xs whitespace-pre-line text-muted-foreground">
          {pin.label && <span className="font-medium">{pin.label}: </span>}
          {pin.address}
          {pin.coordinates.radius && <span> · somewhere within {formatRadius(pin.coordinates.radius)}</span>}
        </div>
      </div>
      <Button variant="ghost" size="icon-xs" aria-label="Unpin from map" title="Unpin from map (keeps the address)" disabled={update.isPending} onClick={() => void unpin()}>
        <MapPinOffIcon />
      </Button>
    </div>
  );
}

function InteractionPinRow({ pin }: { pin: Extract<MapPin, { kind: "interaction" }> }) {
  const ids = pin.participants.map((p) => p.id);
  const update = useUpdateInteraction(ids);
  const del = useDeleteInteraction(ids);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const Icon = INTERACTION_ICONS[pin.type];
  const unpin = async () => {
    try {
      await update.mutateAsync({ id: pin.interactionId, input: { coordinates: null } });
      toast.success("Unpinned; the interaction is kept");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async () => {
    try {
      await del.mutateAsync(pin.interactionId);
      toast.success("Interaction deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[0.7rem]">
          <Icon className="size-3" /> {INTERACTION_LABELS[pin.type]}
        </Badge>
        {formatDate(pin.occurredAt)}
        <span className="ml-auto flex gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Unpin from map" title="Unpin from map (keeps the interaction)" disabled={update.isPending} onClick={() => void unpin()}>
            <MapPinOffIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Delete interaction" title="Delete interaction" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
          </Button>
        </span>
      </div>
      <Link to={`/interactions/${pin.interactionId}`} className="font-medium hover:underline">
        {pin.summary}
      </Link>
      {(pin.participants.length > 0 || pin.location || pin.coordinates.radius) && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {pin.participants.map((p) => (
            <Link key={p.id} to={`/contacts/${p.id}`} className="flex items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-0.5 hover:bg-muted">
              <ContactAvatar contact={p} className="size-4" />
              {p.displayName}
            </Link>
          ))}
          {pin.location && <span>{pin.location}</span>}
          {pin.coordinates.radius && <span>· somewhere within {formatRadius(pin.coordinates.radius)}</span>}
        </div>
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pin.summary}”?</AlertDialogTitle>
            <AlertDialogDescription>It is removed from every participant's feed, along with its attachments. To keep it and only take it off the map, use Unpin instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Popup for one marker: every pin that shares its spot, each with unpin (and, for interactions, delete). */
export function PinPopup({ group }: { group: PinGroup }) {
  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
      {group.pins.map((pin) => (pin.kind === "contact" ? <ContactPinRow key={pin.id} pin={pin} /> : <InteractionPinRow key={pin.id} pin={pin} />))}
    </div>
  );
}
