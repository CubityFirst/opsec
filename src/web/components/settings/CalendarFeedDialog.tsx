import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CALENDAR_SOURCES, CALENDAR_SOURCE_LABELS, type CalendarFeedOut, type CalendarSource } from "@shared/schemas/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useCreateCalendarFeed, useUpdateCalendarFeed } from "@/lib/queries/calendar";

const DEFAULT_SOURCES: CalendarSource[] = ["interactions", "reminders", "birthdays"];

/** Create or edit a calendar feed: a name and the record types it carries. */
export function CalendarFeedDialog({ feed, open, onOpenChange }: { feed?: CalendarFeedOut; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateCalendarFeed();
  const update = useUpdateCalendarFeed();
  const [name, setName] = useState("");
  const [sources, setSources] = useState<CalendarSource[]>(DEFAULT_SOURCES);

  useEffect(() => {
    if (!open) return;
    setName(feed?.name ?? "");
    setSources(feed?.sources ?? DEFAULT_SOURCES);
  }, [open, feed]);

  const toggle = (s: CalendarSource, on: boolean) => setSources((prev) => (on ? [...prev, s] : prev.filter((x) => x !== s)));
  const valid = name.trim().length > 0 && sources.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      if (feed) await update.mutateAsync({ id: feed.id, name: name.trim(), sources });
      else await create.mutateAsync({ name: name.trim(), sources });
      toast.success(feed ? "Feed updated" : "Feed created");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{feed ? "Edit feed" : "New calendar feed"}</DialogTitle>
            <DialogDescription>Pick what this calendar shows. Each feed has its own subscription URL, so you can keep several with different contents.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-name">Name</Label>
            <Input id="feed-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birthdays and reminders" maxLength={60} />
            <p className="text-xs text-muted-foreground">Shown as the calendar's name in your calendar app.</p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Include</legend>
            {CALENDAR_SOURCES.map((s) => {
              const id = `feed-source-${s}`;
              return (
                <label key={s} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm has-data-checked:border-primary/50 has-data-checked:bg-primary/5">
                  <Checkbox id={id} className="mt-0.5" checked={sources.includes(s)} onCheckedChange={(v) => toggle(s, v === true)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{CALENDAR_SOURCE_LABELS[s].label}</span>
                    <span className="text-xs text-muted-foreground">{CALENDAR_SOURCE_LABELS[s].hint}</span>
                  </span>
                </label>
              );
            })}
            {sources.length === 0 && <p className="text-xs text-destructive">Pick at least one.</p>}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || create.isPending || update.isPending}>
              {feed ? "Save" : "Create feed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
