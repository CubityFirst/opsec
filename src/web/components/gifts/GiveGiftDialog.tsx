import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { GiftOut } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useGiveGift } from "@/lib/queries/gifts";
import { todayLocal } from "./GiftDialog";

/** Turn an idea into a gift that has been given: pick the day and, if it was not set yet, the occasion and price. */
export function GiveGiftDialog({ gift, open, onOpenChange }: { gift: GiftOut; open: boolean; onOpenChange: (open: boolean) => void }) {
  const give = useGiveGift(gift.contact.id);
  const [on, setOn] = useState(todayLocal());
  const [occasion, setOccasion] = useState(gift.occasion ?? "");
  const [price, setPrice] = useState(gift.price ?? "");

  useEffect(() => {
    if (open) {
      setOn(todayLocal());
      setOccasion(gift.occasion ?? "");
      setPrice(gift.price ?? "");
    }
  }, [open, gift]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await give.mutateAsync({ id: gift.id, input: { on: on || undefined, occasion: occasion.trim() || null, price: price.trim() || null } });
      toast.success("Gift given");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Mark as given</DialogTitle>
            <DialogDescription>
              “{gift.name}” for {gift.contact.displayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="give-on">Given on</Label>
            <Input id="give-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="give-occasion">Occasion (optional)</Label>
              <Input id="give-occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Christmas 2026" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="give-price">Price (optional)</Label>
              <Input id="give-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. £40" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={give.isPending}>
              Given
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
