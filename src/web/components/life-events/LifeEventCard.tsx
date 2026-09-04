import { BriefcaseIcon, HeartIcon, HeartPulseIcon, HouseIcon, PencilIcon, PlaneIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LIFE_EVENT_CATEGORY_LABELS, type LifeEventCategory } from "@shared/schemas/life-event";
import type { LifeEventOut } from "@shared/types";
import { MarkdownBody } from "@/components/MarkdownBody";
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
import { errorMessage } from "@/lib/api";
import { formatBirthday } from "@/lib/format";
import { useDeleteLifeEvent } from "@/lib/queries/life-events";
import { cn } from "@/lib/utils";
import { LifeEventDialog } from "./LifeEventDialog";

const ICONS: Record<LifeEventCategory, LucideIcon> = {
  work_education: BriefcaseIcon,
  family_relationships: HeartIcon,
  home_living: HouseIcon,
  health_wellness: HeartPulseIcon,
  travel_experiences: PlaneIcon,
};

export function LifeEventIcon({ category, className }: { category: LifeEventCategory; className?: string }) {
  const Icon = ICONS[category];
  return <Icon className={className} aria-hidden />;
}

/** Date without the age suffix that formatBirthday adds for full dates. */
export function formatEventDate(value: string): string {
  return formatBirthday(value).split(" (")[0]!;
}

export function LifeEventCard({ lifeEvent, compact = false }: { lifeEvent: LifeEventOut; compact?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const del = useDeleteLifeEvent(lifeEvent.contactId);

  const onDelete = async () => {
    try {
      await del.mutateAsync(lifeEvent.id);
      toast.success("Life event deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className={cn(compact && "py-3")}>
      <CardContent className={cn("flex flex-col gap-2", compact && "px-4")}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LifeEventIcon category={lifeEvent.category} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{lifeEvent.title}</span>
              <Badge variant="secondary">{LIFE_EVENT_CATEGORY_LABELS[lifeEvent.category]}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{formatEventDate(lifeEvent.occurredOn)}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditOpen(true)}>
              <PencilIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
            </Button>
          </div>
        </div>
        {lifeEvent.body && !compact && <MarkdownBody className="text-sm text-muted-foreground">{lifeEvent.body}</MarkdownBody>}
      </CardContent>

      <LifeEventDialog contactId={lifeEvent.contactId} lifeEvent={lifeEvent} open={editOpen} onOpenChange={setEditOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this life event?</AlertDialogTitle>
            <AlertDialogDescription>“{lifeEvent.title}” will be removed. The activity log keeps a note that it existed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
