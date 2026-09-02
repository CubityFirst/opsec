import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ContactDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/lib/api";
import { useSetContactTags } from "@/lib/queries/contacts";
import { TagChip } from "./TagChip";
import { TagNamesInput } from "./TagNamesInput";

export function TagPicker({ contact }: { contact: ContactDetail }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const setTags = useSetContactTags(contact.id);

  const save = async (names: string[]) => {
    try {
      await setTags.mutateAsync(names);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {contact.tags.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => void save(contact.tags.filter((x) => x.id !== t.id).map((x) => x.name))} />
      ))}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft(contact.tags.map((t) => t.name));
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" className="text-muted-foreground">
            <PlusIcon /> {contact.tags.length === 0 ? "Add tag" : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="flex flex-col gap-3">
            <TagNamesInput value={draft} onChange={setDraft} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={setTags.isPending}
                onClick={async () => {
                  await save(draft);
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
