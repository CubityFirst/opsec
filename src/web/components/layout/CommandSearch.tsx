import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { KindBadge } from "@/components/contacts/KindBadge";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useSearch } from "@/lib/queries/search";
import { useDebounce } from "@/lib/useDebounce";

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 200);
  const { data, isFetching } = useSearch(debounced);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const hits = data?.contacts ?? [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search contacts" description="Jump to a contact">
      <Command shouldFilter={false}>
      <CommandInput placeholder="Search by name, phone, email, tag…" value={q} onValueChange={setQ} />
      <CommandList>
        {debounced.trim().length === 0 ? (
          <CommandEmpty>Type to search.</CommandEmpty>
        ) : hits.length === 0 ? (
          <CommandEmpty>{isFetching ? "Searching…" : "No matches."}</CommandEmpty>
        ) : (
          <CommandGroup heading="Contacts">
            {hits.map((hit) => (
              <CommandItem
                key={hit.id}
                value={hit.id}
                onSelect={() => {
                  onOpenChange(false);
                  navigate(`/contacts/${hit.id}`);
                }}
              >
                <ContactAvatar contact={hit} className="size-6" />
                <span className="truncate">{hit.displayName}</span>
                <KindBadge kind={hit.kind} className="ml-1" />
                {hit.matchedOn !== "name" && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">{hit.matchText}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
