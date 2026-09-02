import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS, lifeEventCreateSchema, type LifeEventCategory, type LifeEventCreateInput } from "@shared/schemas/life-event";
import type { LifeEventOut } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { MentionTextarea } from "@/components/MentionTextarea";
import { BirthdayInput } from "@/components/contacts/BirthdayInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { useCreateLifeEvent, useUpdateLifeEvent } from "@/lib/queries/life-events";
import { LifeEventIcon } from "./LifeEventCard";

const formSchema = z.preprocess((v) => {
  const o = { ...(v as Record<string, unknown>) };
  if (o.body === "") o.body = null;
  return o;
}, lifeEventCreateSchema);

type FormValues = { category: LifeEventCategory; title: string; occurredOn: string; body: string };

export function LifeEventDialog({
  contactId,
  lifeEvent,
  open,
  onOpenChange,
  initialCategory,
}: {
  contactId: string;
  lifeEvent?: LifeEventOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: LifeEventCategory;
}) {
  const create = useCreateLifeEvent(contactId);
  const update = useUpdateLifeEvent(contactId);
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues, unknown, LifeEventCreateInput>({
    resolver: zodResolver(formSchema as never),
    defaultValues: { category: "work_education", title: "", occurredOn: "", body: "" },
  });

  useEffect(() => {
    if (open)
      reset({
        category: lifeEvent?.category ?? initialCategory ?? "work_education",
        title: lifeEvent?.title ?? "",
        occurredOn: lifeEvent?.occurredOn ?? "",
        body: lifeEvent?.body ?? "",
      });
  }, [open, lifeEvent, initialCategory, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (lifeEvent) await update.mutateAsync({ id: lifeEvent.id, input: values });
      else await create.mutateAsync(values);
      toast.success(lifeEvent ? "Life event updated" : "Life event added");
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
            <DialogTitle>{lifeEvent ? "Edit life event" : "Add life event"}</DialogTitle>
            <DialogDescription>A milestone worth remembering: a new job, a move, a wedding, a trip.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFE_EVENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          <span className="flex items-center gap-2">
                            <LifeEventIcon category={c} className="size-3.5" />
                            {LIFE_EVENT_CATEGORY_LABELS[c]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="le-date">When</Label>
              <Controller
                control={control}
                name="occurredOn"
                render={({ field }) => <BirthdayInput id="le-date" value={field.value} onChange={field.onChange} invalid={!!formState.errors.occurredOn} />}
              />
              <FieldError message={formState.errors.occurredOn?.message} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-title">Title</Label>
            <Input id="le-title" autoFocus placeholder="e.g. Started at Acme, Moved to Leeds, Had a baby" {...register("title")} aria-invalid={!!formState.errors.title} />
            <FieldError message={formState.errors.title?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="le-body">Details</Label>
            <Controller control={control} name="body" render={({ field }) => <MentionTextarea id="le-body" rows={4} value={field.value} onChange={field.onChange} />} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
