import { MapPinIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { INTERACTION_ICONS } from "@/lib/interaction-icons";
import type { PinGroup } from "./groupPins";

/** The teardrop every marker is drawn with; `tone` picks the colour. */
export function Teardrop({ tone, count, title, active, children }: { tone: "contact" | "interaction" | "edit"; count?: number; title?: string; active?: boolean; children: ReactNode }) {
  return (
    <div className="opsec-pin-body" data-tone={tone} data-active={active ? "true" : undefined} title={title}>
      <div className="opsec-pin-head">{children}</div>
      <div className="opsec-pin-stem" />
      {count !== undefined && count > 1 && <span className="opsec-pin-count">{count}</span>}
    </div>
  );
}

/** Marker for everything at one spot: the first contact's face, or the first interaction's icon. */
export function PinMarker({ group, active = false }: { group: PinGroup; active?: boolean }) {
  const contact = group.pins.find((p) => p.kind === "contact");
  if (contact && contact.kind === "contact") {
    const names = group.pins.map((p) => (p.kind === "contact" ? p.contact.displayName : p.summary)).join(", ");
    return (
      <Teardrop tone="contact" count={group.pins.length} title={names} active={active}>
        <ContactAvatar contact={contact.contact} className="size-8 text-sm" />
      </Teardrop>
    );
  }
  const first = group.pins[0];
  if (first && first.kind === "interaction") {
    const Icon = INTERACTION_ICONS[first.type];
    return (
      <Teardrop tone="interaction" count={group.pins.length} title={group.pins.map((p) => (p.kind === "interaction" ? p.summary : "")).join(", ")} active={active}>
        <Icon className="size-4" />
      </Teardrop>
    );
  }
  return (
    <Teardrop tone="edit">
      <MapPinIcon className="size-4" />
    </Teardrop>
  );
}
