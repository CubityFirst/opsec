import { DownloadIcon, ExternalLinkIcon, FileIcon, ImageIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { toast } from "sonner";
import type { FileOut } from "@shared/types";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useContactFiles, useDeleteFile } from "@/lib/queries/files";
import type { ContactOutletContext } from "../ContactDetailPage";
import { ErrorState } from "../ContactsPage";

export function FilesTab() {
  const { contact } = useOutletContext<ContactOutletContext>();
  const query = useContactFiles(contact.id);
  const del = useDeleteFile(contact.id);
  const [target, setTarget] = useState<FileOut | null>(null);

  const onDelete = async () => {
    if (!target) return;
    try {
      await del.mutateAsync(target.id);
      toast.success(`Deleted ${target.filename}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Files</h2>
        <p className="text-sm text-muted-foreground">Photos and attachments from interactions. Attach files when logging an interaction.</p>
      </div>
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No files yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead className="hidden sm:table-cell">Kind</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                      {f.contentType.startsWith("image/") ? (
                        <img src={f.url} alt="" className="size-8 rounded object-cover" loading="lazy" />
                      ) : (
                        <FileIcon className="size-5 text-muted-foreground" />
                      )}
                      <span className="truncate">{f.filename}</span>
                    </a>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">
                      {f.kind !== "attachment" ? <ImageIcon className="size-3" /> : null}
                      {f.kind === "avatar" ? "avatar" : f.kind === "avatar_original" ? "full photo" : "attachment"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatBytes(f.size)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(f.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a href={f.url} target="_blank" rel="noreferrer" aria-label="Open">
                          <ExternalLinkIcon />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a href={`${f.url}?download=1`} aria-label="Download">
                          <DownloadIcon />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setTarget(f)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.filename}?</AlertDialogTitle>
            <AlertDialogDescription>The file is removed from storage permanently.</AlertDialogDescription>
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
