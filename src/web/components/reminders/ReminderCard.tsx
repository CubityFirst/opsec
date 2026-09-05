import { BellIcon, CheckIcon, MoreHorizontalIcon, PencilIcon, RepeatIcon, RotateCcwIcon, SkipForwardIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { describeRepeat } from "@shared/schemas/reminder";
import type { ReminderOut } from "@shared/types";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCompleteReminder, useDeleteReminder, useReopenReminder, useSkipReminder } from "@/lib/queries/reminders";
import { cn } from "@/lib/utils";
import { ReminderDialog } from "./ReminderDialog";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today as YYYY-MM-DD in the browser's timezone. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Days from today (local) to a YYYY-MM-DD day; negative when it has passed. */
export function daysUntil(day: string, now = new Date()): number {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(y!, m! - 1, d!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** "due today", "tomorrow", "in 3 days", "3 days overdue". `due` marks today or overdue. */
export function describeDue(dueOn: string, now = new Date()): { text: string; due: boolean; overdue: boolean } {
  const n = daysUntil(dueOn, now);
  if (n === 0) return { text: "due today", due: true, overdue: false };
  if (n === 1) return { text: "tomorrow", due: false, overdue: false };
  if (n > 1) return { text: `in ${n} days`, due: false, overdue: false };
  if (n === -1) return { text: "1 day overdue", due: true, overdue: true };
  return { text: `${-n} days overdue`, due: true, overdue: true };
}

/** "Every 2 weeks until 1 Jan 2027" */
export function repeatLabel(r: ReminderOut["repeat"]): string {
  const s = describeRepeat(r, formatDate);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One reminder. `showContact` adds who it is about (Reminders page, dashboard);
 * the contact page leaves it off because it is implied.
 */
export function ReminderCard({ reminder, showContact = false, compact = false }: { reminder: ReminderOut; showContact?: boolean; compact?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const complete = useCompleteReminder();
  const skip = useSkipReminder();
  const reopen = useReopenReminder();
  const del = useDeleteReminder();
  const open = reminder.status === "open";
  const due = describeDue(reminder.dueOn);
  const repeating = !!reminder.repeat;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const doneLabel = repeating ? (reminder.dueOn > todayLocal() ? "Done for now" : "Done, on to the next") : "Done";

  return (
    <Card className={cn(compact && "py-3", !open && "opacity-75")}>
      <CardContent className={cn("flex flex-col gap-2", compact && "px-4")}>
        <div className="flex items-start gap-3">
          {open ? (
            <Button
              variant="outline"
              size="icon-sm"
              className={cn("mt-0.5 shrink-0 rounded-full", due.due && "border-amber-500/60")}
              title={doneLabel}
              aria-label={doneLabel}
              disabled={complete.isPending}
              onClick={() => void run(() => complete.mutateAsync(reminder), repeating ? "Marked done; moved to the next occurrence" : "Reminder done")}
            >
              <CheckIcon className="size-4 opacity-0 transition-opacity hover:opacity-100" />
            </Button>
          ) : (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" title="Done" aria-label="Done" role="img">
              <CheckIcon className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("font-medium", !open && "line-through decoration-muted-foreground/60")}>{reminder.title}</span>
              {repeating && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" title={repeatLabel(reminder.repeat)}>
                  <RepeatIcon className="size-3" /> {repeatLabel(reminder.repeat)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {showContact && reminder.contact && (
                <>
                  <Link to={`/contacts/${reminder.contact.id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:underline">
                    <ContactAvatar contact={reminder.contact} className="size-4" /> {reminder.contact.displayName}
                  </Link>
                  <span aria-hidden>·</span>
                </>
              )}
              {open ? (
                <span className={cn("flex items-center gap-1", due.overdue ? "font-medium text-rose-600 dark:text-rose-400" : due.due && "font-medium text-amber-600 dark:text-amber-400")}>
                  <BellIcon className="size-3" /> {formatDate(reminder.dueOn)} ({due.text})
                </span>
              ) : (
                <span>done {formatDate(reminder.completedAt)}</span>
              )}
              {repeating && reminder.completedCount > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    done {reminder.completedCount} {reminder.completedCount === 1 ? "time" : "times"}
                    {reminder.lastCompletedOn ? `, last ${formatDate(reminder.lastCompletedOn)}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
                {open && repeating && (
                  <DropdownMenuItem onSelect={() => void run(() => skip.mutateAsync(reminder), "Skipped to the next occurrence")}>
                    <SkipForwardIcon /> Skip this one
                  </DropdownMenuItem>
                )}
                {!open && (
                  <DropdownMenuItem onSelect={() => void run(() => reopen.mutateAsync(reminder), "Reminder reopened")}>
                    <RotateCcwIcon /> Reopen
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {!compact && reminder.notes && <MarkdownBody className="text-sm text-muted-foreground">{reminder.notes}</MarkdownBody>}
      </CardContent>

      <ReminderDialog reminder={reminder} contact={showContact ? undefined : (reminder.contact ?? undefined)} open={editOpen} onOpenChange={setEditOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              “{reminder.title}” will be removed{repeating ? ", including every future occurrence" : ""}.{reminder.contact ? " The activity log keeps a note that it existed." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run(() => del.mutateAsync(reminder), "Reminder deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
