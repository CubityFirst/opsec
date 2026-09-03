import { LinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { toast } from "sonner";
import type { ContactRef, RelationshipOut } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { DeceasedBadge } from "@/components/contacts/DeceasedBadge";
import { KindBadge } from "@/components/contacts/KindBadge";
import { RelationshipDialog } from "@/components/relationships/RelationshipDialog";
import { RelationshipEditDialog } from "@/components/relationships/RelationshipEditDialog";
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
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { capitalize, formatDate } from "@/lib/format";
import { useDeleteRelationship, useRelationships } from "@/lib/queries/relationships";
import type { ContactOutletContext } from "../ContactDetailPage";
import { ErrorState } from "../ContactsPage";

const ORDER = ["family", "pet", "social", "group", "work", "care", "other"];

export function RelationshipsTab() {
  const { contact } = useOutletContext<ContactOutletContext>();
  const [addOpen, setAddOpen] = useState(false);
  const query = useRelationships(contact.id);

  const groups = useMemo(() => {
    const map = new Map<string, RelationshipOut[]>();
    for (const r of query.data?.items ?? []) {
      const g = map.get(r.category) ?? [];
      g.push(r);
      map.set(r.category, g);
    }
    return [...map.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, [query.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Relationships</h2>
        <Button onClick={() => setAddOpen(true)}>
          <LinkIcon /> Add relationship
        </Button>
      </div>

      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {contact.displayName} is not linked to anyone yet. That is fine too.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groups.map(([category, items]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">{capitalize(category)}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {items.map((r) => (
                    <RelationshipRow key={r.id} rel={r} contact={contact} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RelationshipDialog contact={contact} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function RelationshipRow({ rel, contact }: { rel: RelationshipOut; contact: ContactRef }) {
  const del = useDeleteRelationship([contact.id, rel.otherContact.id]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const onDelete = async () => {
    try {
      await del.mutateAsync(rel.id);
      toast.success("Relationship removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <li className="flex items-center gap-3 py-2" title="Right-click for options">
            <Link to={`/contacts/${rel.otherContact.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <ContactAvatar contact={rel.otherContact} className="size-9" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium hover:underline">{rel.otherContact.displayName}</span>
                  <KindBadge kind={rel.otherContact.kind} />
                  {rel.otherContact.deceased && <DeceasedBadge />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {rel.typeLabel}
                  {rel.label && ` · ${rel.label}`}
                  {rel.startedAt && ` · since ${formatDate(rel.startedAt)}`}
                  {rel.endedAt && ` · until ${formatDate(rel.endedAt)}`}
                </div>
              </div>
            </Link>
          </li>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon /> Edit
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2Icon /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <RelationshipEditDialog contact={contact} rel={rel} open={editOpen} onOpenChange={setEditOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              {rel.otherContact.displayName} will no longer be listed as {rel.typeLabel.toLowerCase()} of {contact.displayName}. Both activity feeds record the removal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
