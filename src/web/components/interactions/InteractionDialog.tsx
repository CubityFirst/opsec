import { zodResolver } from "@hookform/resolvers/zod";
import { PaperclipIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { INTERACTION_TYPES } from "@shared/schemas/common";
import { interactionCreateSchema, type InteractionCreateInput } from "@shared/schemas/interaction";
import type { ContactRef, InteractionOut } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { FieldError } from "@/components/FieldError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MentionTextarea } from "@/components/MentionTextarea";
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, formatBytes, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { useCreateInteraction, useUpdateInteraction, useUploadAttachments } from "@/lib/queries/interactions";

const formSchema = z.preprocess((v) => {
  const o = { ...(v as Record<string, unknown>) };
  for (const k of ["body", "location"]) if (o[k] === "") o[k] = null;
  if (typeof o.occurredAt === "string" && o.occurredAt && !o.occurredAt.endsWith("Z") && !/[+-]\d\d:\d\d$/.test(o.occurredAt)) {
    o.occurredAt = fromDateTimeLocal(o.occurredAt);
  }
  return o;
}, interactionCreateSchema);

type FormValues = {
  type: (typeof INTERACTION_TYPES)[number];
  occurredAt: string;
  summary: string;
  body: string;
  location: string;
  contactIds: string[];
};

export function InteractionDialog({
  open,
  onOpenChange,
  initialParticipants,
  interaction,
  initialValues,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Participants preselected when creating. */
  initialParticipants: ContactRef[];
  /** When provided, edits this interaction. */
  interaction?: InteractionOut;
  /** Prefilled fields when creating (e.g. from an Ask proposal). */
  initialValues?: Partial<Pick<InteractionCreateInput, "type" | "occurredAt" | "summary" | "body" | "location">>;
  /** Called after a successful create or update. */
  onSaved?: () => void;
}) {
  const isEdit = !!interaction;
  const [participants, setParticipants] = useState<ContactRef[]>(initialParticipants);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = useCreateInteraction();
  const update = useUpdateInteraction(interaction?.participants.map((p) => p.id) ?? []);
  const upload = useUploadAttachments(participants.map((p) => p.id));

  const { register, control, handleSubmit, reset, setValue, formState } = useForm<FormValues, unknown, InteractionCreateInput>({
    resolver: zodResolver(formSchema as never),
    defaultValues: { type: "call", occurredAt: toDateTimeLocal(null), summary: "", body: "", location: "", contactIds: [] },
  });

  useEffect(() => {
    if (!open) return;
    const p = interaction ? interaction.participants : initialParticipants;
    setParticipants(p);
    setFiles([]);
    reset({
      type: interaction?.type ?? initialValues?.type ?? "call",
      occurredAt: toDateTimeLocal(interaction?.occurredAt ?? initialValues?.occurredAt ?? null),
      summary: interaction?.summary ?? initialValues?.summary ?? "",
      body: interaction?.body ?? initialValues?.body ?? "",
      location: interaction?.location ?? initialValues?.location ?? "",
      contactIds: p.map((x) => x.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interaction]);

  useEffect(() => {
    setValue("contactIds", participants.map((p) => p.id), { shouldValidate: formState.isSubmitted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await update.mutateAsync({ id: interaction.id, input: values });
        if (files.length) await upload.mutateAsync({ interactionId: interaction.id, files });
        toast.success("Interaction updated");
      } else {
        const created = await create.mutateAsync(values);
        if (files.length) {
          try {
            await upload.mutateAsync({ interactionId: created.id, files });
          } catch (e) {
            toast.error(`Logged, but attachments failed: ${errorMessage(e)}`);
          }
        }
        toast.success("Interaction logged");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const pending = create.isPending || update.isPending || upload.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit interaction" : "Log interaction"}</DialogTitle>
            <DialogDescription>What happened, when, and with whom.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {INTERACTION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="i-when">When</Label>
              <Input id="i-when" type="datetime-local" {...register("occurredAt")} aria-invalid={!!formState.errors.occurredAt} />
              <FieldError message={formState.errors.occurredAt?.message} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="i-summary">Summary</Label>
            <Controller
              control={control}
              name="summary"
              render={({ field }) => (
                <MentionTextarea
                  id="i-summary"
                  rows={1}
                  value={field.value}
                  onChange={(v) => field.onChange(v.replace(/\r|\n/g, " "))}
                  placeholder="Caught up about the new job · @ to mention"
                  className="min-h-9 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
              )}
            />
            <FieldError message={formState.errors.summary?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="i-body">Details</Label>
            <Controller control={control} name="body" render={({ field }) => <MentionTextarea id="i-body" rows={5} value={field.value} onChange={field.onChange} />} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="i-location">Location</Label>
            <Input id="i-location" placeholder="Optional" {...register("location")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>With</Label>
            <div className="flex flex-wrap gap-1">
              {participants.map((p) => (
                <Badge key={p.id} variant="secondary" className="gap-1 pl-1 font-normal">
                  <ContactAvatar contact={p} className="size-4" />
                  {p.displayName}
                  {participants.length > 1 && (
                    <button type="button" aria-label={`Remove ${p.displayName}`} onClick={() => setParticipants(participants.filter((x) => x.id !== p.id))}>
                      <XIcon className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            <ContactPicker value={null} placeholder="Add another participant…" excludeIds={participants.map((p) => p.id)} onSelect={(c) => setParticipants([...participants, c])} />
            <FieldError message={formState.errors.contactIds?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Attachments</Label>
              <Button type="button" variant="outline" size="xs" onClick={() => fileRef.current?.click()}>
                <PaperclipIcon /> Add files
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  setFiles([...files, ...Array.from(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    <button type="button" className="ml-auto" aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Log it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
