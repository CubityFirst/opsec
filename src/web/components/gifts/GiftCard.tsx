import { ExternalLinkIcon, LightbulbIcon, MoreHorizontalIcon, PackageCheckIcon, PackageOpenIcon, PencilIcon, RotateCcwIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { GIFT_STATUS_LABELS, type GiftStatus } from "@shared/schemas/gift";
import type { GiftCounts, GiftOut } from "@shared/types";
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
import { useDeleteGift, useRevertGift } from "@/lib/queries/gifts";
import { cn } from "@/lib/utils";
import { GiftDialog } from "./GiftDialog";
import { GiveGiftDialog } from "./GiveGiftDialog";

/** Icon and tint for the status circle. */
const STATUS_STYLE: Record<GiftStatus, { icon: LucideIcon; circle: string }> = {
  idea: { icon: LightbulbIcon, circle: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  given: { icon: PackageCheckIcon, circle: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  received: { icon: PackageOpenIcon, circle: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
};

/** "2 ideas · 3 given · 1 received" */
export function describeGiftCounts(c: GiftCounts): string {
  const parts: string[] = [];
  if (c.idea) parts.push(`${c.idea} ${c.idea === 1 ? "idea" : "ideas"}`);
  if (c.given) parts.push(`${c.given} given`);
  if (c.received) parts.push(`${c.received} received`);
  return parts.join(" · ");
}

export function GiftStatusIcon({ status, className }: { status: GiftStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  const label = GIFT_STATUS_LABELS[status];
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", s.circle, className)} title={label} aria-label={label} role="img">
      <Icon className="size-4" />
    </span>
  );
}

/**
 * One gift. `showContact` adds who it is for / from (dashboard); the contact
 * page leaves it off because it is implied.
 */
export function GiftCard({ gift, showContact = false, compact = false }: { gift: GiftOut; showContact?: boolean; compact?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const del = useDeleteGift(gift.contact.id);
  const revert = useRevertGift(gift.contact.id);
  const idea = gift.status === "idea";

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
            <Link to={`/contacts/${gift.contact.id}`} className="mt-0.5 shrink-0" title={gift.contact.displayName}>
              <ContactAvatar contact={gift.contact} className="size-8" />
            </Link>
          ) : (
            <GiftStatusIcon status={gift.status} className="mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{gift.name}</span>
              {gift.price && <Badge variant="secondary">{gift.price}</Badge>}
              {gift.url && (
                <a href={gift.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title={gift.url} aria-label="Open link">
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {showContact && (
                <>
                  <span>
                    {gift.status === "received" ? "from" : "for"}{" "}
                    <Link to={`/contacts/${gift.contact.id}`} className="font-medium text-foreground hover:underline">
                      {gift.contact.displayName}
                    </Link>
                  </span>
                  <span aria-hidden>·</span>
                </>
              )}
              {idea ? <span>idea</span> : <span>{gift.status} {formatDate(gift.givenOn)}</span>}
              {gift.occasion && (
                <>
                  <span aria-hidden>·</span>
                  <span>{gift.occasion}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {idea && (
              <Button variant="outline" size="sm" onClick={() => setGiveOpen(true)}>
                Given
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
                {!idea && (
                  <DropdownMenuItem onSelect={() => void run(() => revert.mutateAsync(gift.id), "Back to an idea")}>
                    <RotateCcwIcon /> Back to idea
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
        {!compact && gift.notes && <MarkdownBody className="text-sm text-muted-foreground">{gift.notes}</MarkdownBody>}
        {compact && gift.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{gift.notes}</p>}
      </CardContent>

      <GiftDialog contact={gift.contact} gift={gift} open={editOpen} onOpenChange={setEditOpen} />
      <GiveGiftDialog gift={gift} open={giveOpen} onOpenChange={setGiveOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this gift?</AlertDialogTitle>
            <AlertDialogDescription>“{gift.name}” will be removed. The activity log keeps a note that it existed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run(() => del.mutateAsync(gift.id), "Gift deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
