import { Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { COUNTRY_SUGGESTIONS } from "@shared/countries";
import { RELIGION_SUGGESTIONS } from "@shared/religion";
import { contactUpdateSchema } from "@shared/schemas/contact";
import type { ContactDetail, ContactRef } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useUpdateContact } from "@/lib/queries/contacts";
import { BirthdayInput } from "./BirthdayInput";
import { ContactPicker } from "./ContactPicker";
import { ObservanceSlider } from "./ObservanceSlider";

/** The groups of the About card that can be edited on their own. */
export type ContactFieldGroup = "birthday" | "religion" | "originCountry" | "met";

type Draft = {
  birthday: string;
  religion: string;
  religionObservance: number | null;
  originCountry: string;
  metOn: string;
  metWhere: string;
  metHow: string;
  metVia: ContactRef | null;
};

function draftOf(c: ContactDetail): Draft {
  return {
    birthday: c.birthday ?? "",
    religion: c.religion ?? "",
    religionObservance: c.religionObservance,
    originCountry: c.originCountry ?? "",
    metOn: c.metOn ?? "",
    metWhere: c.metWhere ?? "",
    metHow: c.metHow ?? "",
    metVia: c.metVia,
  };
}

/** Empty means "clear it", so blanks go to the API as null rather than "". */
const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

/**
 * Edits one line of a contact's About card without opening the whole contact
 * form: a dialog with just that field (or, for "how we met", just those four),
 * saved with the same PATCH the big form uses.
 */
export function ContactFieldDialog({
  contact,
  group,
  onOpenChange,
}: {
  contact: ContactDetail;
  /** null closes the dialog. */
  group: ContactFieldGroup | null;
  onOpenChange: (group: ContactFieldGroup | null) => void;
}) {
  const update = useUpdateContact(contact.id);
  const [draft, setDraft] = useState<Draft>(() => draftOf(contact));
  const [error, setError] = useState<string | undefined>();
  const open = group !== null;

  useEffect(() => {
    if (open) {
      setDraft(draftOf(contact));
      setError(undefined);
    }
  }, [open, group, contact]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const title =
    group === "birthday"
      ? contact.kind === "organization"
        ? "Founded"
        : "Birthday"
      : group === "religion"
        ? "Religion"
        : group === "originCountry"
          ? "Country of origin"
          : "How we met";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw: Record<string, unknown> =
      group === "met"
        ? { metOn: orNull(draft.metOn), metWhere: orNull(draft.metWhere), metHow: orNull(draft.metHow), metViaContactId: draft.metVia?.id ?? null }
        : group === "birthday"
          ? { birthday: orNull(draft.birthday) }
          : group === "religion"
            ? // Observance hangs off the religion: clearing one clears the other.
              { religion: orNull(draft.religion), religionObservance: orNull(draft.religion) === null ? null : draft.religionObservance }
            : { originCountry: orNull(draft.originCountry) };
    const parsed = contactUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That value is not valid");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      toast.success(`${title} updated`);
      onOpenChange(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {contact.displayName} · leave {group === "met" ? "a field" : "it"} empty to clear.
            </DialogDescription>
          </DialogHeader>

          {group === "birthday" && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="field-birthday">{title}</Label>
              <BirthdayInput id="field-birthday" value={draft.birthday} onChange={(val) => set("birthday", val)} invalid={!!error} />
              <p className="text-xs text-muted-foreground">Fill in whichever parts you know. A day needs a month.</p>
            </div>
          )}

          {group === "religion" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-religion">Religion</Label>
              {/* Free text: the list is only a shortcut, so anything typed is kept as typed. */}
              <Input
                id="field-religion"
                autoFocus
                list="field-religion-suggestions"
                placeholder="e.g. Muslim, Catholic, None"
                value={draft.religion}
                onChange={(e) => set("religion", e.target.value)}
              />
              <datalist id="field-religion-suggestions">
                {RELIGION_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <div className="pt-2">
                <ObservanceSlider
                  value={draft.religionObservance}
                  onChange={(val) => set("religionObservance", val)}
                  disabled={draft.religion.trim() === ""}
                />
              </div>
            </div>
          )}

          {group === "originCountry" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-origin">Country of origin</Label>
              <Input
                id="field-origin"
                autoFocus
                list="field-country-suggestions"
                placeholder="e.g. Italy, Hong Kong"
                value={draft.originCountry}
                onChange={(e) => set("originCountry", e.target.value)}
              />
              <datalist id="field-country-suggestions">
                {COUNTRY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          )}

          {group === "met" && (
            <div className="flex flex-col gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="field-met-on">When</Label>
                <BirthdayInput id="field-met-on" value={draft.metOn} onChange={(val) => set("metOn", val)} invalid={!!error} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-met-where">Where</Label>
                <Input id="field-met-where" placeholder="e.g. climbing gym, Bristol" value={draft.metWhere} onChange={(e) => set("metWhere", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Introduced by / known through</Label>
                <div className="flex items-center gap-1">
                  <ContactPicker
                    value={draft.metVia}
                    onSelect={(c) => set("metVia", c)}
                    excludeIds={[contact.id]}
                    placeholder="Pick a contact (optional)"
                    className="min-w-0 flex-1"
                  />
                  {draft.metVia && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => set("metVia", null)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-met-how">How</Label>
                <Textarea id="field-met-how" rows={2} placeholder="e.g. Sat next to each other at Priya's wedding" value={draft.metHow} onChange={(e) => set("metHow", e.target.value)} />
              </div>
            </div>
          )}

          <FieldError message={error} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
