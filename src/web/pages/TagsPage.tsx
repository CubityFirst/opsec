import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { TagWithCount } from "@shared/types";
import { TagChip } from "@/components/contacts/TagChip";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { useAuthUser } from "@/lib/queries/auth";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "@/lib/queries/tags";
import { ErrorState } from "./ContactsPage";

const SWATCHES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export function TagsPage() {
  const query = useTags();
  const [editing, setEditing] = useState<{ open: boolean; tag?: TagWithCount }>({ open: false });
  const [deleting, setDeleting] = useState<TagWithCount | null>(null);
  const del = useDeleteTag();
  const isAdmin = useAuthUser()?.isAdmin ?? false;

  const onDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success(`Deleted tag ${deleting.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">Group contacts however you like: family, book club, ex-colleagues.</p>
        </div>
        <Button onClick={() => setEditing({ open: true })}>
          <PlusIcon /> New tag
        </Button>
      </div>

      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No tags yet. Add tags from a contact's profile or here.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <TagChip tag={t} />
                  </TableCell>
                  <TableCell>
                    <Link to={`/contacts?tag=${encodeURIComponent(t.name)}`} className="text-muted-foreground hover:underline">
                      {t.contactCount} {t.contactCount === 1 ? "contact" : "contacts"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing({ open: true, tag: t })}>
                        <PencilIcon />
                      </Button>
                      {isAdmin && (
                      <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleting(t)}>
                        <Trash2Icon />
                      </Button>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TagDialog open={editing.open} tag={editing.tag} onOpenChange={(o) => setEditing((s) => ({ ...s, open: o }))} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It is removed from {deleting?.contactCount ?? 0} contact(s). The contacts themselves are untouched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TagDialog({ open, tag, onOpenChange }: { open: boolean; tag?: TagWithCount; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const create = useCreateTag();
  const update = useUpdateTag();

  useEffect(() => {
    if (open) {
      setName(tag?.name ?? "");
      setColor(tag?.color ?? null);
    }
  }, [open, tag]);

  const submit = async () => {
    try {
      if (tag) await update.mutateAsync({ id: tag.id, input: { name, color } });
      else await create.mutateAsync({ name, color });
      toast.success(tag ? "Tag updated" : "Tag created");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tag ? "Edit tag" : "New tag"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-label="No colour"
                className={`size-7 rounded-full border ${color === null ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
                onClick={() => setColor(null)}
              />
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className={`size-7 rounded-full ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          {name.trim() && (
            <div>
              <TagChip tag={{ name: name.trim(), color }} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
