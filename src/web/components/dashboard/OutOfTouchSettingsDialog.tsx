import { BellIcon, BellOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { errorMessage } from "@/lib/api";
import { useAuthUser, useUpdatePreferences } from "@/lib/queries/auth";
import { useBulkContacts, useContacts } from "@/lib/queries/contacts";

/**
 * Everything behind the dashboard's "Out of touch" panel in one place: whether
 * people with nothing logged count as out of touch, and the list of contacts the
 * panel never nudges about (`keepInTouch` false, the same flag the contact page
 * and Ask toggle one at a time).
 */
export function OutOfTouchSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const preferences = useAuthUser()?.preferences;
  const includeNever = preferences?.outOfTouchIncludeNever ?? false;
  const updatePreferences = useUpdatePreferences();
  // Only fetched while the dialog is up; the bulk mutation invalidates it on every change.
  const muted = useContacts({ keepInTouch: false, limit: 200, sort: "name" });
  const bulk = useBulkContacts();
  const items = muted.data?.items ?? [];

  const setKeepInTouch = async (id: string, name: string, keepInTouch: boolean) => {
    try {
      await bulk.mutateAsync({ ids: [id], action: "setFields", tagNames: [], fields: { keepInTouch } });
      toast.success(keepInTouch ? `Nudges about ${name} are back on` : `You will not be nudged about ${name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Out of touch</DialogTitle>
          <DialogDescription>Who the dashboard nudges you about when a month goes by without a word.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Switch
              id="out-of-touch-include-never"
              checked={includeNever}
              disabled={!preferences || updatePreferences.isPending}
              onCheckedChange={(v) => updatePreferences.mutate({ outOfTouchIncludeNever: v })}
            />
            <Label htmlFor="out-of-touch-include-never">Include people you have never spoken to</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {includeNever
              ? "People with nothing logged are listed once you have had them on the books for a month."
              : "Only people with a logged interaction are listed; someone you have never logged is treated as no data, not silence."}
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Do not remind me about</h3>
            {items.length > 0 && <span className="text-xs text-muted-foreground">{items.length}</span>}
          </div>
          <ContactPicker
            value={null}
            onSelect={(c) => void setKeepInTouch(c.id, c.displayName, false)}
            excludeIds={items.map((c) => c.id)}
            kinds={["person"]}
            placeholder="Add someone…"
          />
          {muted.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody yet. Everyone you keep up with can turn up in the panel.</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                  <ContactAvatar contact={c} className="size-8" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.displayName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={bulk.isPending}
                    title={`Nudge me about ${c.displayName} again`}
                    onClick={() => void setKeepInTouch(c.id, c.displayName, true)}
                  >
                    <BellIcon /> Remind me
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <BellOffIcon className="mt-0.5 size-3 shrink-0" />
            These contacts are left out of every keep-in-touch check, not just this panel. Their birthdays and reminders still show.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
