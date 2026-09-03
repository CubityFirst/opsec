import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { betCreateSchema, type BetCreateInput } from "@shared/schemas/bet";
import type { BetOut, ContactRef } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { MentionTextarea } from "@/components/MentionTextarea";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useCreateBet, useUpdateBet } from "@/lib/queries/bets";

const formSchema = z.preprocess((v) => {
  const o = { ...(v as Record<string, unknown>) };
  for (const k of ["wager", "details"]) if (o[k] === "") o[k] = null;
  if (o.madeOn === "") delete o.madeOn;
  return o;
}, betCreateSchema);

type FormValues = { prediction: string; wager: string; madeOn: string; reviewOn: string; details: string };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Make or edit a bet. Pass `contact` when the other party is fixed (contact
 * page); otherwise a picker is shown (Bets page, dashboard).
 */
export function BetDialog({
  contact,
  bet,
  open,
  onOpenChange,
}: {
  contact?: ContactRef;
  bet?: BetOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [picked, setPicked] = useState<ContactRef | null>(null);
  const other = contact ?? bet?.contact ?? picked;
  const create = useCreateBet(other?.id ?? "");
  const update = useUpdateBet(other?.id ?? "");
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues, unknown, BetCreateInput>({
    resolver: zodResolver(formSchema as never),
    defaultValues: { prediction: "", wager: "", madeOn: todayLocal(), reviewOn: "", details: "" },
  });

  useEffect(() => {
    if (open) {
      setPicked(null);
      reset({
        prediction: bet?.prediction ?? "",
        wager: bet?.wager ?? "",
        madeOn: bet?.madeOn ?? todayLocal(),
        reviewOn: bet?.reviewOn ?? "",
        details: bet?.details ?? "",
      });
    }
  }, [open, bet, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!other) {
      toast.error("Pick who the bet is with");
      return;
    }
    try {
      if (bet) await update.mutateAsync({ id: bet.id, input: values });
      else await create.mutateAsync(values);
      toast.success(bet ? "Bet updated" : "Bet made");
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
            <DialogTitle>{bet ? "Edit bet" : "Make a bet"}</DialogTitle>
            <DialogDescription>Write down your prediction and when you will both know the answer. {other ? other.displayName : "They"} take{other ? "s" : ""} the other side.</DialogDescription>
          </DialogHeader>
          {!contact && !bet && (
            <div className="flex flex-col gap-1.5">
              <Label>With</Label>
              <ContactPicker value={picked} onSelect={setPicked} kinds={["person", "organization"]} placeholder="Who is the bet with?" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bet-prediction">My prediction</Label>
            <Input id="bet-prediction" autoFocus={!!contact || !!bet} placeholder="e.g. It won't rain on the wedding day" {...register("prediction")} aria-invalid={!!formState.errors.prediction} />
            <FieldError message={formState.errors.prediction?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bet-made">Made on</Label>
              <Input id="bet-made" type="date" {...register("madeOn")} aria-invalid={!!formState.errors.madeOn} />
              <FieldError message={formState.errors.madeOn?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bet-review">Review on</Label>
              <Input id="bet-review" type="date" {...register("reviewOn")} aria-invalid={!!formState.errors.reviewOn} />
              <FieldError message={formState.errors.reviewOn?.message} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bet-wager">Wager (optional)</Label>
            <Input id="bet-wager" placeholder="e.g. £10, a pint, loser buys dinner" {...register("wager")} aria-invalid={!!formState.errors.wager} />
            <FieldError message={formState.errors.wager?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bet-details">Terms &amp; details</Label>
            <Controller control={control} name="details" render={({ field }) => <MentionTextarea id="bet-details" rows={3} value={field.value} onChange={field.onChange} />} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {bet ? "Save" : "Make bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
