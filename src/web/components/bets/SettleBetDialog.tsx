import { BanIcon, ThumbsDownIcon, ThumbsUpIcon, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BET_OUTCOMES, type BetOutcome } from "@shared/schemas/bet";
import type { BetOut } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useSettleBet } from "@/lib/queries/bets";
import { cn } from "@/lib/utils";

const OPTIONS: Record<BetOutcome, { icon: LucideIcon; title: string; hint: (name: string) => string; className: string }> = {
  me: { icon: ThumbsUpIcon, title: "I was right", hint: (n) => `${n} owes the wager`, className: "data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-500/10" },
  them: { icon: ThumbsDownIcon, title: "They were right", hint: () => "I owe the wager", className: "data-[selected=true]:border-rose-500 data-[selected=true]:bg-rose-500/10" },
  void: { icon: BanIcon, title: "Void", hint: () => "Called off or undecidable", className: "data-[selected=true]:border-muted-foreground data-[selected=true]:bg-muted" },
};

/** Record which way a bet fell. Works on settled bets too (changes the outcome). */
export function SettleBetDialog({ bet, open, onOpenChange }: { bet: BetOut; open: boolean; onOpenChange: (open: boolean) => void }) {
  const settle = useSettleBet(bet.contact.id);
  const [outcome, setOutcome] = useState<BetOutcome | null>(bet.outcome);
  const [note, setNote] = useState(bet.settledNote ?? "");

  useEffect(() => {
    if (open) {
      setOutcome(bet.outcome);
      setNote(bet.settledNote ?? "");
    }
  }, [open, bet]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome) {
      toast.error("Pick who was right");
      return;
    }
    try {
      await settle.mutateAsync({ id: bet.id, input: { outcome, note: note.trim() || null } });
      toast.success("Bet settled");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{bet.status === "settled" ? "Change the outcome" : "Settle the bet"}</DialogTitle>
            <DialogDescription>
              “{bet.prediction}”{bet.wager ? ` for ${bet.wager}` : ""}, with {bet.contact.displayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Outcome">
            {BET_OUTCOMES.map((o) => {
              const opt = OPTIONS[o];
              const Icon = opt.icon;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={outcome === o}
                  data-selected={outcome === o}
                  onClick={() => setOutcome(o)}
                  className={cn("flex flex-col items-center gap-1 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-accent", opt.className)}
                >
                  <Icon className="size-5" />
                  <span className="font-medium">{opt.title}</span>
                  <span className="text-xs text-muted-foreground">{opt.hint(bet.contact.displayName)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bet-note">How did it fall?</Label>
            <Textarea id="bet-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 12,400 votes in the end. Paid up at the pub on Friday." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={settle.isPending || !outcome}>
              Settle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
