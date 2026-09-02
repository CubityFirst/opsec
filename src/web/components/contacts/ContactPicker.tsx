import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import type { ContactRef } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearch } from "@/lib/queries/search";
import { useDebounce } from "@/lib/useDebounce";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { KindBadge } from "./KindBadge";

export function ContactPicker({
  value,
  onSelect,
  excludeIds = [],
  kinds,
  placeholder = "Select contact…",
  className,
}: {
  value: ContactRef | null;
  onSelect: (contact: ContactRef) => void;
  excludeIds?: string[];
  /** Only offer contacts of these kinds. */
  kinds?: ContactRef["kind"][];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 200);
  const { data, isFetching } = useSearch(debounced);
  const hits = (data?.contacts ?? []).filter((h) => !excludeIds.includes(h.id) && (!kinds || kinds.includes(h.kind)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", className)}>
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <ContactAvatar contact={value} className="size-5" />
              <span className="truncate">{value.displayName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search contacts…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{debounced.trim() ? (isFetching ? "Searching…" : "No matches.") : "Type to search."}</CommandEmpty>
            {hits.length > 0 && (
              <CommandGroup>
                {hits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={hit.id}
                    onSelect={() => {
                      onSelect(hit);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <ContactAvatar contact={hit} className="size-5" />
                    <span className="truncate">{hit.displayName}</span>
                    <KindBadge kind={hit.kind} />
                    <CheckIcon className={cn("ml-auto size-4", value?.id === hit.id ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
