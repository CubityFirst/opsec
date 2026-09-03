import { BanIcon, CalendarCheckIcon, DicesIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, ThumbsDownIcon, ThumbsUpIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BET_OUTCOME_LABELS, type BetOutcome } from "@shared/schemas/bet";
import type { BetOut, BetRecord } from "@shared/types";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useDeleteBet, useReopenBet } from "@/lib/queries/bets";
import { cn } from "@/lib/utils";
import { BetDialog } from "./BetDialog";
import { SettleBetDialog } from "./SettleBetDialog";

const DAY_MS = 24 * 60 * 60 * 1000;

const OUTCOME_STYLE: Record<BetOutcome, { icon: LucideIcon; badge: string }> = {
  me: { icon: ThumbsUpIcon, badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"},
  them: { icon: ThumbsDownIcon, badge: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"},
  void: { icon: BanIcon, badge: "text-muted-foreground"},
};

/** Days from today (local) to a YYYY-MM-DD day; negative when it has passed. */
export function daysUntil(day: string, now = new Date()): number {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(y!, m! - 1, d!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** "due today", "in 3 days", "3 days overdue". */
export function describeReview(reviewOn: string, now = new Date()): { text: string; due: boolean } {
  const n = daysUntil(reviewOn, now);
  if (n === 0) return { text: "review today", due: true };
  if (n === 1) return { text: "review tomorrow", due: false };
  if (n > 1) return { text: `review in ${n} days`, due: false };
  if (n === -1) return { text: "1 day overdue", due: true };
  return { text: `${-n} days overdue`, due: true };
}

/** "3 won · 1 lost · 2 open" */
export function describeRecord(r: BetRecord): string {
  const parts = [`${r.won} won`, `${r.lost} lost`];
  if (r.void) parts.push(`${r.void} void`);
  parts.push(`${r.open} open`);
  return parts.join(" · ");
}

export function BetOutcomeBadge({ outcome, className }: { outcome: BetOutcome; className?: string }) {
  const s = OUTCOME_STYLE[outcome];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", s.badge, className)}>
      <Icon className="size-3" /> {BET_OUTCOME_LABELS[outcome]}
    </Badge>
  );
}

/**
 * One bet. `showContact` adds the other party (dashboard); the
 * contact page leaves it off because it is implied.
 */
export function BetCard({ bet, showContact = false, compact = false }: { bet: BetOut; showContact?: boolean; compact?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const del = useDeleteBet(bet.contact.id);
  const reopen = useReopenBet(bet.contact.id);
  const review = describeReview(bet.reviewOn);
  const open = bet.status === "open";

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className={cn(compact && "py-3")}>
      <CardContent className={cn("flex flex-col gap-2", compact && "px-4")}>
        <div className="flex items-start gap-3">
          {showContact ? (
            <Link to={`/contacts/${bet.contact.id}`} className="mt-0.5 shrink-0" title={bet.contact.displayName}>
              <ContactAvatar contact={bet.contact} className="size-8" />
            </Link>
          ) : (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <DicesIcon className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{bet.prediction}</span>
              {bet.wager && <Badge variant="secondary">{bet.wager}</Badge>}
              {bet.outcome && <BetOutcomeBadge outcome={bet.outcome} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {showContact && (
                <>
                  <span>
                    with{" "}
                    <Link to={`/contacts/${bet.contact.id}`} className="font-medium text-foreground hover:underline">
                      {bet.contact.displayName}
                    </Link>
                  </span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span>made {formatDate(bet.madeOn)}</span>
              <span aria-hidden>·</span>
              {open ? (
                <span className={cn("flex items-center gap-1", review.due && "font-medium text-amber-600 dark:text-amber-400")}>
                  <CalendarCheckIcon className="size-3" /> {formatDate(bet.reviewOn)} ({review.text})
                </span>
              ) : (
                <span>settled {formatDate(bet.settledAt)}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {open && (
              <Button variant={review.due ? "default" : "outline"} size="sm" onClick={() => setSettleOpen(true)}>
                Settle
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <PencilIcon /> Edit
                </DropdownMenuItem>
                {open ? null : (
                  <>
                    <DropdownMenuItem onSelect={() => setSettleOpen(true)}>
                      <ThumbsUpIcon /> Change outcome
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void run(() => reopen.mutateAsync(bet.id), "Bet reopened")}>
                      <RotateCcwIcon /> Reopen
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {!compact && bet.details && <MarkdownBody className="text-sm text-muted-foreground">{bet.details}</MarkdownBody>}
        {bet.settledNote && (
          <p className={cn("text-sm", compact ? "line-clamp-2 text-muted-foreground" : "rounded-md bg-muted px-3 py-2")}>
            <span className="text-muted-foreground">How it fell: </span>
            {bet.settledNote}
          </p>
        )}
      </CardContent>

      <BetDialog contact={bet.contact} bet={bet} open={editOpen} onOpenChange={setEditOpen} />
      <SettleBetDialog bet={bet} open={settleOpen} onOpenChange={setSettleOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bet?</AlertDialogTitle>
            <AlertDialogDescription>“{bet.prediction}” will be removed. The activity log keeps a note that it existed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run(() => del.mutateAsync(bet.id), "Bet deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
