import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContactRef, RelationshipTypeOut } from "@shared/types";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { KIND_LABELS, capitalize } from "@/lib/format";
import { useCreateRelationship, useRelationshipTypes } from "@/lib/queries/relationships";

export function groupTypes(types: RelationshipTypeOut[]): [string, RelationshipTypeOut[]][] {
  const groups = new Map<string, RelationshipTypeOut[]>();
  for (const t of [...types].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const g = groups.get(t.category) ?? [];
    g.push(t);
    groups.set(t.category, g);
  }
  return [...groups.entries()];
}

/** Types where `from` may be this contact and, once chosen, `to` may be the other contact. */
export function applicableTypes(types: RelationshipTypeOut[], from: ContactRef, to: ContactRef | null): RelationshipTypeOut[] {
  return types.filter((t) => t.fromKinds.includes(from.kind) && (!to || t.toKinds.includes(to.kind)));
}

function describeKinds(kinds: RelationshipTypeOut["toKinds"]): string {
  const words = { person: "a person", pet: "a pet", organization: "an organisation" } as const;
  return kinds.map((k) => words[k]).join(" or ");
}

export function RelationshipDialog({ contact, open, onOpenChange }: { contact: ContactRef; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [other, setOther] = useState<ContactRef | null>(null);
  const [typeKey, setTypeKey] = useState<string>("");
  const [label, setLabel] = useState("");
  const types = useRelationshipTypes();
  const create = useCreateRelationship();

  const applicable = useMemo(() => applicableTypes(types.data?.items ?? [], contact, other), [types.data, contact, other]);
  const grouped = useMemo(() => groupTypes(applicable), [applicable]);
  const selected = types.data?.items.find((t) => t.key === typeKey);
  const inverse = selected && types.data?.items.find((t) => t.key === selected.inverseKey);

  useEffect(() => {
    if (open) {
      setOther(null);
      setTypeKey("");
      setLabel("");
    }
  }, [open]);

  // Picking a contact the current type cannot link to clears the type (and says so).
  useEffect(() => {
    if (typeKey && !applicable.some((t) => t.key === typeKey)) {
      const t = types.data?.items.find((x) => x.key === typeKey);
      setTypeKey("");
      if (t && other) toast.info(`"${t.label}" cannot link ${contact.displayName} to ${other.displayName}; pick another relationship.`);
    }
  }, [applicable, typeKey, types.data, other, contact.displayName]);

  // Once a type is chosen, only offer contacts it can link to.
  const allowedOtherKinds = selected ? selected.toKinds : undefined;

  const submit = async () => {
    if (!other || !typeKey) return;
    try {
      await create.mutateAsync({ fromContactId: contact.id, toContactId: other.id, typeKey, label: label || null, notes: null, startedAt: null, endedAt: null });
      toast.success(`Linked ${contact.displayName} and ${other.displayName}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const kindHint = other
    ? `Showing relationships ${KIND_LABELS[contact.kind].toLowerCase()} → ${KIND_LABELS[other.kind].toLowerCase()}.`
    : `Showing relationships that apply to ${KIND_LABELS[contact.kind].toLowerCase() === "organisation" ? "an organisation" : `a ${KIND_LABELS[contact.kind].toLowerCase()}`}.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add relationship</DialogTitle>
          <DialogDescription>Describe how {contact.displayName} relates to someone. The reverse side is inferred automatically.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{contact.displayName} is the…</Label>
            <Select value={typeKey} onValueChange={setTypeKey}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a relationship" />
              </SelectTrigger>
              <SelectContent>
                {grouped.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No relationship types apply.</div>}
                {grouped.map(([category, items]) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{capitalize(category)}</SelectLabel>
                    {items.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{kindHint}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>…of</Label>
            <ContactPicker value={other} onSelect={setOther} excludeIds={[contact.id]} kinds={allowedOtherKinds} placeholder={selected ? `Pick ${describeKinds(selected.toKinds)}` : "Pick a contact"} />
          </div>
          {selected && other && inverse && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {contact.displayName} → <b>{selected.label}</b> of {other.displayName}. {other.displayName} → <b>{inverse.label}</b> of {contact.displayName}.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-label">Label (optional)</Label>
            <Input id="r-label" placeholder="e.g. best man, childhood friend" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!other || !typeKey || create.isPending} onClick={() => void submit()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
