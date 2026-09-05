import { zodResolver } from "@hookform/resolvers/zod";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isoDateSchema } from "@shared/schemas/common";
import { REPEAT_UNITS, type ReminderCreateInput, type RepeatUnit } from "@shared/schemas/reminder";
import type { ContactRef, ReminderOut } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { MentionTextarea } from "@/components/MentionTextarea";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { useCreateReminder, useUpdateReminder } from "@/lib/queries/reminders";

const REPEAT_CHOICES: { value: "once" | RepeatUnit; label: string }[] = [
  { value: "once", label: "Does not repeat" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const UNIT_PLURAL: Record<RepeatUnit, string> = { day: "days", week: "weeks", month: "months", year: "years" };

const formSchema = z
  .object({
    title: z.string().trim().min(1, "What should it remind you of?").max(200),
    dueOn: isoDateSchema.or(z.literal("")).refine((v) => v !== "", "Pick a day"),
    repeatUnit: z.enum(["once", ...REPEAT_UNITS]),
    repeatEvery: z.coerce.number().int("Whole numbers only").min(1, "At least 1").max(999),
    repeatUntil: isoDateSchema.or(z.literal("")),
    notes: z.string().max(20_000),
  })
  .refine((v) => v.repeatUnit === "once" || !v.repeatUntil || v.repeatUntil >= v.dueOn, { path: ["repeatUntil"], message: "Must not be before the due date" });

type FormValues = z.input<typeof formSchema>;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toInput(v: z.output<typeof formSchema>, contactId: string | null): ReminderCreateInput {
  return {
    contactId,
    title: v.title,
    notes: v.notes.trim() ? v.notes : null,
    dueOn: v.dueOn,
    repeat: v.repeatUnit === "once" ? null : { every: v.repeatEvery, unit: v.repeatUnit, until: v.repeatUntil || null },
  };
}

/**
 * Set or edit a reminder. With `contact` the reminder is pinned to that contact
 * (the contact page); without it the form offers an optional contact picker.
 */
export function ReminderDialog({ contact, reminder, open, onOpenChange }: { contact?: ContactRef; reminder?: ReminderOut; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const [about, setAbout] = useState<ContactRef | null>(null);
  const { register, control, handleSubmit, reset, watch, formState } = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", dueOn: todayLocal(), repeatUnit: "once", repeatEvery: 1, repeatUntil: "", notes: "" },
  });
  const repeatUnit = watch("repeatUnit");
  const every = Number(watch("repeatEvery")) || 1;

  useEffect(() => {
    if (!open) return;
    setAbout(contact ?? reminder?.contact ?? null);
    reset({
      title: reminder?.title ?? "",
      dueOn: reminder?.dueOn ?? todayLocal(),
      repeatUnit: reminder?.repeat?.unit ?? "once",
      repeatEvery: reminder?.repeat?.every ?? 1,
      repeatUntil: reminder?.repeat?.until ?? "",
      notes: reminder?.notes ?? "",
    });
  }, [open, reminder, contact, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const input = toInput(values, contact?.id ?? about?.id ?? null);
    try {
      if (reminder) await update.mutateAsync({ id: reminder.id, input });
      else await create.mutateAsync(input);
      toast.success(reminder ? "Reminder updated" : "Reminder set");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{reminder ? "Edit reminder" : contact ? `Reminder about ${contact.displayName}` : "New reminder"}</DialogTitle>
            <DialogDescription>Something to do on a day, once or on a schedule. {contact ? "" : "Attach a contact if it is about someone."}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rem-title">Remind me to</Label>
            <Input id="rem-title" autoFocus placeholder={contact ? `e.g. Call ${contact.displayName} about the trip` : "e.g. Renew passport"} {...register("title")} aria-invalid={!!formState.errors.title} />
            <FieldError message={formState.errors.title?.message} />
          </div>
          {!contact && (
            <div className="flex flex-col gap-1.5">
              <Label>About (optional)</Label>
              <div className="flex items-center gap-2">
                <ContactPicker value={about} onSelect={setAbout} placeholder="Nobody in particular" className="flex-1" />
                {about && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear contact" onClick={() => setAbout(null)}>
                    <XIcon />
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rem-due">{repeatUnit === "once" ? "Due on" : reminder ? "Next due on" : "First due on"}</Label>
              <Input id="rem-due" type="date" {...register("dueOn")} aria-invalid={!!formState.errors.dueOn} />
              <FieldError message={formState.errors.dueOn?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Repeats</Label>
              <Controller
                control={control}
                name="repeatUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPEAT_CHOICES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {repeatUnit !== "once" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rem-every">Every</Label>
                  <div className="flex items-center gap-2">
                    <Input id="rem-every" type="number" min={1} max={999} className="w-24" {...register("repeatEvery")} aria-invalid={!!formState.errors.repeatEvery} />
                    <span className="text-sm text-muted-foreground">{every === 1 ? repeatUnit : UNIT_PLURAL[repeatUnit]}</span>
                  </div>
                  <FieldError message={formState.errors.repeatEvery?.message} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rem-until">Until (optional)</Label>
                  <Input id="rem-until" type="date" {...register("repeatUntil")} aria-invalid={!!formState.errors.repeatUntil} />
                  <FieldError message={formState.errors.repeatUntil?.message} />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rem-notes">Notes</Label>
            <Controller control={control} name="notes" render={({ field }) => <MentionTextarea id="rem-notes" rows={3} value={field.value} onChange={field.onChange} />} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {reminder ? "Save" : "Set reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
