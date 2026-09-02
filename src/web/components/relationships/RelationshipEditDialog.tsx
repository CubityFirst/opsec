import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContactRef, RelationshipOut, RelationshipTypeOut } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { useRelationshipTypes, useUpdateRelationship } from "@/lib/queries/relationships";
import { groupTypes } from "./RelationshipDialog";

/**
 * Edit a relationship as seen from `contact`'s page. The picker shows the
 * OTHER contact's role (matching the list), and the stored type is derived
 * from the row's direction: outgoing rows store the inverse of what is shown.
 */
export function RelationshipEditDialog({
  contact,
  rel,
  open,
  onOpenChange,
}: {
  contact: ContactRef;
  rel: RelationshipOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const types = useRelationshipTypes();
  const update = useUpdateRelationship([contact.id, rel.otherContact.id]);
  const [shownTypeKey, setShownTypeKey] = useState(rel.typeKey);
  const [label, setLabel] = useState(rel.label ?? "");
  const [notes, setNotes] = useState(rel.notes ?? "");
  const [startedAt, setStartedAt] = useState(rel.startedAt ?? "");
  const [endedAt, setEndedAt] = useState(rel.endedAt ?? "");

  useEffect(() => {
    if (open) {
      setShownTypeKey(rel.typeKey);
      setLabel(rel.label ?? "");
      setNotes(rel.notes ?? "");
      setStartedAt(rel.startedAt ?? "");
      setEndedAt(rel.endedAt ?? "");
    }
  }, [open, rel]);

  const all = types.data?.items ?? [];
  const byKey = useMemo(() => new Map(all.map((t) => [t.key, t])), [all]);

  // Which "other's role" types are valid for this pair, given the stored direction.
  const applicable = useMemo(() => {
    const fits = (t: RelationshipTypeOut, from: ContactRef, to: ContactRef) => t.fromKinds.includes(from.kind) && t.toKinds.includes(to.kind);
    return all.filter((shown) => {
      if (rel.direction === "incoming") return fits(shown, rel.otherContact, contact);
      const stored = byKey.get(shown.inverseKey);
      return !!stored && fits(stored, contact, rel.otherContact);
    });
  }, [all, byKey, rel, contact]);
  const grouped = useMemo(() => groupTypes(applicable), [applicable]);

  const submit = async () => {
    const shown = byKey.get(shownTypeKey);
    if (!shown) return;
    const storedTypeKey = rel.direction === "incoming" ? shown.key : shown.inverseKey;
    try {
      await update.mutateAsync({
        id: rel.id,
        input: { typeKey: storedTypeKey, label: label || null, notes: notes || null, startedAt: startedAt || null, endedAt: endedAt || null },
      });
      toast.success("Relationship updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit relationship</DialogTitle>
          <DialogDescription>
            {rel.otherContact.displayName}, as seen from {contact.displayName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{rel.otherContact.displayName} is {contact.displayName}'s…</Label>
            <Select value={shownTypeKey} onValueChange={setShownTypeKey}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a relationship" />
              </SelectTrigger>
              <SelectContent>
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="re-label">Label (optional)</Label>
            <Input id="re-label" placeholder="e.g. best man, childhood friend" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="re-start">Since</Label>
              <Input id="re-start" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="re-end">Until</Label>
              <Input id="re-end" type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="re-notes">Notes</Label>
            <Textarea id="re-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!shownTypeKey || update.isPending} onClick={() => void submit()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
