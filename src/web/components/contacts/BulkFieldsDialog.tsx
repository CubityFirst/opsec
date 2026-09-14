import { Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { COUNTRY_SUGGESTIONS } from "@shared/countries";
import { RELIGION_SUGGESTIONS } from "@shared/religion";
import type { ContactBulkFields } from "@shared/schemas/contact";
import type { ContactRef } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ContactPicker } from "./ContactPicker";
import { ObservanceSlider } from "./ObservanceSlider";

/** The fields this dialog can set, in the order they are shown. */
const FIELDS = ["originCountry", "religion", "religionObservance", "jobTitle", "employerContactId", "keepInTouch"] as const;
type Field = (typeof FIELDS)[number];

const LABELS: Record<Field, string> = {
  originCountry: "Country of origin",
  religion: "Religion",
  religionObservance: "How devoted",
  jobTitle: "Job title",
  employerContactId: "Place of work",
  keepInTouch: "Keep-in-touch nudges",
};

type Draft = {
  originCountry: string;
  religion: string;
  religionObservance: number | null;
  jobTitle: string;
  employer: ContactRef | null;
  keepInTouch: boolean;
};

const EMPTY: Draft = { originCountry: "", religion: "", religionObservance: null, jobTitle: "", employer: null, keepInTouch: true };

/**
 * Sets the same value on every selected contact — "these forty are all from the
 * UK", "these twelve work at Acme". A field is only touched when its box is
 * ticked, so an untouched field is left alone and a ticked empty one clears it.
 */
export function BulkFieldsDialog({
  count,
  open,
  onOpenChange,
  onApply,
  pending,
}: {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (fields: ContactBulkFields) => Promise<void>;
  pending: boolean;
}) {
  const [include, setInclude] = useState<Field[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    if (open) {
      setInclude([]);
      setDraft(EMPTY);
    }
  }, [open]);

  const on = (f: Field) => include.includes(f);
  const toggle = (f: Field, checked: boolean) => setInclude((prev) => (checked ? [...prev, f] : prev.filter((x) => x !== f)));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

  const apply = async () => {
    const fields: ContactBulkFields = {};
    if (on("originCountry")) fields.originCountry = orNull(draft.originCountry);
    if (on("religion")) fields.religion = orNull(draft.religion);
    if (on("religionObservance")) fields.religionObservance = draft.religionObservance;
    if (on("jobTitle")) fields.jobTitle = orNull(draft.jobTitle);
    if (on("employerContactId")) fields.employerContactId = draft.employer?.id ?? null;
    if (on("keepInTouch")) fields.keepInTouch = draft.keepInTouch;
    await onApply(fields);
  };

  const row = (f: Field, control: React.ReactNode, hint?: string) => (
    <div key={f} className="flex flex-col gap-1.5 rounded-lg border p-3">
      <label className="flex items-center gap-2">
        <Checkbox checked={on(f)} onCheckedChange={(v) => toggle(f, v === true)} />
        <span className="text-sm font-medium">{LABELS[f]}</span>
      </label>
      <div className={on(f) ? undefined : "pointer-events-none opacity-50"} aria-hidden={!on(f)}>
        {control}
      </div>
      {hint && on(f) && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Set fields on {count} {count === 1 ? "contact" : "contacts"}
          </DialogTitle>
          <DialogDescription>
            Tick a field to set it on all of them; leave it unticked and it is left alone. A ticked but empty field clears the value. The country and the
            nudges suit every kind; religion, job and place of work are for people, so pets and organisations in the selection skip those.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {row(
            "originCountry",
            <>
              <Input list="bulk-country-suggestions" placeholder="e.g. United Kingdom" value={draft.originCountry} onChange={(e) => set("originCountry", e.target.value)} />
              <datalist id="bulk-country-suggestions">
                {COUNTRY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>,
          )}
          {row(
            "religion",
            <>
              <Input list="bulk-religion-suggestions" placeholder="e.g. Muslim, Catholic, None" value={draft.religion} onChange={(e) => set("religion", e.target.value)} />
              <datalist id="bulk-religion-suggestions">
                {RELIGION_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </>,
          )}
          {row("religionObservance", <ObservanceSlider value={draft.religionObservance} onChange={(v) => set("religionObservance", v)} />)}
          {row("jobTitle", <Input placeholder="e.g. Audit Manager" value={draft.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />)}
          {row(
            "employerContactId",
            <div className="flex items-center gap-1">
              <ContactPicker value={draft.employer} onSelect={(c) => set("employer", c)} kinds={["organization"]} placeholder="Pick an organisation" className="min-w-0 flex-1" />
              {draft.employer && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => set("employer", null)}>
                  <Trash2Icon />
                </Button>
              )}
            </div>,
            "Adds the employer relationship to each of them.",
          )}
          {row(
            "keepInTouch",
            <div className="flex items-center gap-2">
              <Switch id="bulk-keep-in-touch" checked={draft.keepInTouch} onCheckedChange={(v) => set("keepInTouch", v)} />
              <Label htmlFor="bulk-keep-in-touch">{draft.keepInTouch ? "Nudge me when we lose touch" : "Leave them out of the nudges"}</Label>
            </div>,
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={include.length === 0 || pending} onClick={() => void apply()}>
            {pending ? "Saving…" : `Set ${include.length === 1 ? "field" : "fields"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
