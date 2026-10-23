import { differenceInCalendarDays, parseISO } from "date-fns";
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AskConversationSummary } from "@shared/schemas/ask";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAskConversations, useDeleteAskConversation } from "@/lib/queries/ask";
import { cn } from "@/lib/utils";

const GROUPS = [
  { label: "Today", maxDays: 0 },
  { label: "Yesterday", maxDays: 1 },
  { label: "Previous 7 days", maxDays: 7 },
  { label: "Previous 30 days", maxDays: 30 },
  { label: "Older", maxDays: Infinity },
] as const;

function groupByAge(items: AskConversationSummary[]): { label: string; items: AskConversationSummary[] }[] {
  const now = new Date();
  const groups = GROUPS.map((g) => ({ label: g.label, items: [] as AskConversationSummary[] }));
  for (const c of items) {
    const days = differenceInCalendarDays(now, parseISO(c.updatedAt));
    groups[GROUPS.findIndex((g) => days <= g.maxDays)]!.items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** Recent Ask conversations, newest first; picking one opens it, the menu deletes it. */
export function ConversationList({
  currentId,
  onOpen,
  onNew,
  onDeleted,
  className,
}: {
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** The conversation was deleted; the page leaves it if it was on screen. */
  onDeleted: (id: string) => void;
  className?: string;
}) {
  const list = useAskConversations();
  const del = useDeleteAskConversation();

  const remove = (id: string) =>
    del.mutate(id, {
      onSuccess: () => {
        onDeleted(id);
        toast.success("Conversation deleted");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <nav aria-label="Recent conversations" className={cn("flex min-h-0 flex-col gap-3", className)}>
      <Button variant="outline" size="sm" className="justify-start" onClick={onNew}>
        <PlusIcon /> New conversation
      </Button>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {list.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="px-2 text-xs text-destructive">Could not load conversations.</p>
        ) : list.data.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Your conversations will be listed here.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {groupByAge(list.data).map((g) => (
              <div key={g.label} className="flex flex-col gap-0.5">
                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground",
                      c.id === currentId && "bg-accent font-medium text-accent-foreground",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                      title={`${c.title}\n${formatDateTime(c.updatedAt)}`}
                      aria-current={c.id === currentId ? "page" : undefined}
                      onClick={() => onOpen(c.id)}
                    >
                      {c.title}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for “${c.title}”`}
                          className="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" disabled={del.isPending} onSelect={() => remove(c.id)}>
                          <Trash2Icon /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
