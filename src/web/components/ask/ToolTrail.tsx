import { CheckIcon, ChevronRightIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { TrailItem } from "@/lib/queries/ask";
import { cn } from "@/lib/utils";

/** The assistant's lookups, live while streaming and collapsible afterwards. */
export function ToolTrail({ items, streaming }: { items: TrailItem[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const pending = items.filter((i) => i.ok === undefined).length;
  const expanded = streaming || open;
  return (
    <div className="rounded-md border bg-muted/40 text-xs">
      <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-muted-foreground" onClick={() => setOpen((o) => !o)}>
        {streaming && pending > 0 ? <Loader2Icon className="size-3.5 animate-spin" /> : <SearchIcon className="size-3.5" />}
        <span className="flex-1">
          {streaming ? "Investigating…" : `Looked at ${items.length} thing${items.length === 1 ? "" : "s"}`}
        </span>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1 border-t px-2 py-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {i.ok === undefined ? <Loader2Icon className="size-3 animate-spin" /> : i.ok ? <CheckIcon className="size-3 text-emerald-600" /> : <XIcon className="size-3 text-destructive" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground">{i.label}</span>
                {i.summary && <span className="text-muted-foreground"> · {i.summary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
