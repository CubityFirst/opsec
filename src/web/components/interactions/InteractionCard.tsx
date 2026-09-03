import { MentionText } from "@/components/MentionText";
import { MapPinIcon, PaperclipIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Link } from "react-router";
import { toast } from "sonner";
import type { InteractionOut } from "@shared/types";
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
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { useDeleteInteraction } from "@/lib/queries/interactions";
import { InteractionDialog } from "./InteractionDialog";

export function InteractionCard({
  interaction,
  currentContactId,
}: {
  interaction: InteractionOut;
  currentContactId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const del = useDeleteInteraction(interaction.participants.map((p) => p.id));
  const others = interaction.participants.filter((p) => p.id !== currentContactId);

  const onDelete = async () => {
    try {
      await del.mutateAsync(interaction.id);
      toast.success("Interaction deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-start gap-2">
          <Badge variant="outline">{INTERACTION_LABELS[interaction.type]}</Badge>
          <span className="text-xs text-muted-foreground" title={formatDateTime(interaction.occurredAt)}>
            {formatRelative(interaction.occurredAt)} · {formatDateTime(interaction.occurredAt)}
          </span>
          <div className="ml-auto flex gap-0.5">
            <Button variant="ghost" size="icon-xs" aria-label="Edit interaction" onClick={() => setEditOpen(true)}>
              <PencilIcon />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Delete interaction" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
            </Button>
          </div>
        </div>
        <p className="font-medium">
          <MentionText text={interaction.summary} />
        </p>
        {interaction.body && (
          <MarkdownBody className="text-sm text-muted-foreground">{interaction.body}</MarkdownBody>
        )}
        {(others.length > 0 || interaction.location) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {others.length > 0 && <span>with</span>}
            {others.map((p) => (
              <Link key={p.id} to={`/contacts/${p.id}`} className="flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 hover:bg-muted">
                <ContactAvatar contact={p} className="size-4" />
                {p.displayName}
              </Link>
            ))}
            {interaction.location && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3" /> {interaction.location}
              </span>
            )}
          </div>
        )}
        {interaction.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {interaction.attachments.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  <PaperclipIcon className="size-3" />
                  <span className="max-w-48 truncate">{f.filename}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <InteractionDialog open={editOpen} onOpenChange={setEditOpen} initialParticipants={interaction.participants} interaction={interaction} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this interaction?</AlertDialogTitle>
            <AlertDialogDescription>It is removed from every participant's feed, along with its attachments.</AlertDialogDescription>
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
