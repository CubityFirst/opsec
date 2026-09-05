import { zodResolver } from "@hookform/resolvers/zod";
import { LightbulbIcon, PackageCheckIcon, PackageOpenIcon, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GIFT_STATUSES, giftCreateSchema, type GiftCreateInput, type GiftStatus } from "@shared/schemas/gift";
import type { ContactRef, GiftOut } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useCreateGift, useUpdateGift } from "@/lib/queries/gifts";
import { cn } from "@/lib/utils";

const formSchema = z.preprocess((v) => {
  const o = { ...(v as Record<string, unknown>) };
  for (const k of ["occasion", "price", "url", "notes"]) if (o[k] === "") o[k] = null;
  if (o.givenOn === "" || o.status === "idea") o.givenOn = null;
  return o;
}, giftCreateSchema);

type FormValues = { name: string; status: GiftStatus; occasion: string; givenOn: string; price: string; url: string; notes: string };

export const STATUS_OPTIONS: Record<GiftStatus, { icon: LucideIcon; title: string; hint: (name: string) => string; className: string }> = {
  idea: { icon: LightbulbIcon, title: "Idea", hint: (n) => `Something to get ${n} one day`, className: "data-[selected=true]:border-amber-500 data-[selected=true]:bg-amber-500/10" },
  given: { icon: PackageCheckIcon, title: "Given", hint: (n) => `I gave this to ${n}`, className: "data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-500/10" },
  received: { icon: PackageOpenIcon, title: "Received", hint: (n) => `${n} gave this to me`, className: "data-[selected=true]:border-sky-500 data-[selected=true]:bg-sky-500/10" },
};

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add or edit a gift for one contact (an idea, or something given or received). */
export function GiftDialog({
  contact,
  gift,
  initialStatus = "idea",
  open,
  onOpenChange,
}: {
  contact: ContactRef;
  gift?: GiftOut;
  initialStatus?: GiftStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateGift(contact.id);
  const update = useUpdateGift(contact.id);
  const { register, control, handleSubmit, reset, watch, formState } = useForm<FormValues, unknown, GiftCreateInput>({
    resolver: zodResolver(formSchema as never),
    defaultValues: { name: "", status: initialStatus, occasion: "", givenOn: todayLocal(), price: "", url: "", notes: "" },
  });
  const status = watch("status");

  useEffect(() => {
    if (open)
      reset({
        name: gift?.name ?? "",
        status: gift?.status ?? initialStatus,
        occasion: gift?.occasion ?? "",
        givenOn: gift?.givenOn ?? todayLocal(),
        price: gift?.price ?? "",
        url: gift?.url ?? "",
        notes: gift?.notes ?? "",
      });
  }, [open, gift, initialStatus, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (gift) await update.mutateAsync({ id: gift.id, input: values });
      else await create.mutateAsync(values);
      toast.success(gift ? "Gift updated" : values.status === "idea" ? "Idea saved" : "Gift recorded");
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
            <DialogTitle>{gift ? "Edit gift" : `Gift with ${contact.displayName}`}</DialogTitle>
            <DialogDescription>An idea for later, something you gave {contact.displayName}, or something they gave you.</DialogDescription>
          </DialogHeader>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Status">
                {GIFT_STATUSES.map((s) => {
                  const opt = STATUS_OPTIONS[s];
                  const Icon = opt.icon;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={field.value === s}
                      data-selected={field.value === s}
                      onClick={() => field.onChange(s)}
                      className={cn("flex flex-col items-center gap-1 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-accent", opt.className)}
                    >
                      <Icon className="size-5" />
                      <span className="font-medium">{opt.title}</span>
                      <span className="text-xs text-muted-foreground">{opt.hint(contact.displayName)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gift-name">Gift</Label>
            <Input id="gift-name" autoFocus placeholder="e.g. Bottle of Islay whisky" {...register("name")} aria-invalid={!!formState.errors.name} />
            <FieldError message={formState.errors.name?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gift-occasion">Occasion (optional)</Label>
              <Input id="gift-occasion" placeholder="e.g. 40th birthday, Christmas" {...register("occasion")} aria-invalid={!!formState.errors.occasion} />
              <FieldError message={formState.errors.occasion?.message} />
            </div>
            {status !== "idea" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gift-date">{status === "received" ? "Received on" : "Given on"}</Label>
                <Input id="gift-date" type="date" {...register("givenOn")} aria-invalid={!!formState.errors.givenOn} />
                <FieldError message={formState.errors.givenOn?.message} />
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gift-price">Price (optional)</Label>
              <Input id="gift-price" placeholder="e.g. £40" {...register("price")} aria-invalid={!!formState.errors.price} />
              <FieldError message={formState.errors.price?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gift-url">Link (optional)</Label>
              <Input id="gift-url" type="url" placeholder="https://" {...register("url")} aria-invalid={!!formState.errors.url} />
              <FieldError message={formState.errors.url?.message} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gift-notes">Notes</Label>
            <Controller control={control} name="notes" render={({ field }) => <MentionTextarea id="gift-notes" rows={3} value={field.value} onChange={field.onChange} />} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {gift ? "Save" : status === "idea" ? "Save idea" : "Record gift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
