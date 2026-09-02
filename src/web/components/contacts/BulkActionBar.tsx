import { ArchiveIcon, ArchiveRestoreIcon, TagPlusIcon, TagXIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ContactBulkAction } from "@shared/schemas/contact";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/lib/api";
import { useAuthUser } from "@/lib/queries/auth";
import { useBulkContacts } from "@/lib/queries/contacts";
import { TagNamesInput } from "./TagNamesInput";

function TagsPopover({
  label,
  icon,
  onApply,
  pending,
}: {
  label: string;
  icon: React.ReactNode;
  onApply: (names: string[]) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNames([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {icon} {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex flex-col gap-3">
          <TagNamesInput value={names} onChange={setNames} placeholder="Tag name, Enter to add" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={names.length === 0 || pending}
              onClick={async () => {
                await onApply(names);
                setOpen(false);
              }}
            >
              {label}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Actions for the contacts selected in the list. */
export function BulkActionBar({
  ids,
  pageIds,
  onSelectAll,
  onClear,
}: {
  ids: string[];
  pageIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const bulk = useBulkContacts();
  const isAdmin = useAuthUser()?.isAdmin ?? false;
  const [deleteOpen, setDeleteOpen] = useState(false);

  const run = async (action: ContactBulkAction, tagNames: string[] = []) => {
    try {
      const { updated } = await bulk.mutateAsync({ ids, action, tagNames });
      const verb: Record<ContactBulkAction, string> = {
        addTags: "Tagged",
        removeTags: "Untagged",
        archive: "Archived",
        unarchive: "Unarchived",
        delete: "Deleted",
      };
      toast.success(`${verb[action]} ${updated} ${updated === 1 ? "contact" : "contacts"}`);
      if (action === "delete") onClear();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => ids.includes(id));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2" role="toolbar" aria-label="Bulk actions">
      <span className="text-sm font-medium">
        {ids.length} selected
      </span>
      {!allOnPageSelected && (
        <Button variant="link" size="sm" className="h-auto px-1" onClick={onSelectAll}>
          Select all on page
        </Button>
      )}
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <TagsPopover label="Add tags" icon={<TagPlusIcon />} pending={bulk.isPending} onApply={(names) => run("addTags", names)} />
      <TagsPopover label="Remove tags" icon={<TagXIcon />} pending={bulk.isPending} onApply={(names) => run("removeTags", names)} />
      <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => void run("archive")}>
        <ArchiveIcon /> Archive
      </Button>
      <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => void run("unarchive")}>
        <ArchiveRestoreIcon /> Unarchive
      </Button>
      {isAdmin && (
        <Button variant="destructive" size="sm" disabled={bulk.isPending} onClick={() => setDeleteOpen(true)}>
          <Trash2Icon /> Delete
        </Button>
      )}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear} title="Clear selection (Esc)">
        <XIcon /> Clear
      </Button>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ids.length} {ids.length === 1 ? "contact" : "contacts"} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes their photos, files and any interactions that involve only these contacts. Archiving is the reversible alternative.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run("delete")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
