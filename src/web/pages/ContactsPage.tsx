import { MentionText } from "@/components/MentionText";
import { plainMentions } from "@shared/mentions";
import { ArchiveIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import type { ContactKind } from "@shared/schemas/common";
import type { ContactSort } from "@shared/schemas/contact";
import type { ContactSummary } from "@shared/types";
import { BulkActionBar } from "@/components/contacts/BulkActionBar";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { DeceasedBadge } from "@/components/contacts/DeceasedBadge";
import { KindBadge } from "@/components/contacts/KindBadge";
import { TagChip } from "@/components/contacts/TagChip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { KIND_LABELS, formatRelative } from "@/lib/format";
import { useContacts } from "@/lib/queries/contacts";
import { useTags } from "@/lib/queries/tags";
import { useDebounce } from "@/lib/useDebounce";

const PAGE = 50;
const ALL = "__all__";

export function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebounce(search, 250);

  const kind = (params.get("kind") as ContactKind | null) ?? undefined;
  const tag = params.get("tag") ?? undefined;
  // status=archived|deceased; the older ?archived=true links still work.
  const status = params.get("status") === "deceased" ? "deceased" : params.get("status") === "archived" || params.get("archived") === "true" ? "archived" : "active";
  const archived = status === "archived";
  const deceased = status === "deceased";
  const sort = (params.get("sort") as ContactSort | null) ?? "name";
  const page = Math.max(0, Number(params.get("page") ?? 0));

  const setParam = (key: string, value: string | undefined, resetPage = true) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === "" || value === ALL) next.delete(key);
    else next.set(key, value);
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== q) setParam("q", q || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useContacts({ q: q || undefined, kind, tag, archived, deceased, sort, limit: PAGE, offset: page * PAGE });
  const tags = useTags();
  const createOpen = location.pathname.endsWith("/new");

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  // Selection for bulk actions. Click (or Ctrl+click) an avatar to toggle a
  // contact; Shift+click selects the range from the last toggled row.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const pageIds = (query.data?.items ?? []).map((c) => c.id);

  const toggleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && anchor && pageIds.includes(anchor) && pageIds.includes(id)) {
          const [from, to] = [pageIds.indexOf(anchor), pageIds.indexOf(id)].sort((x, y) => x - y);
          for (const pid of pageIds.slice(from, to + 1)) next.add(pid);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (!e.shiftKey) setAnchor(id);
    },
    [anchor, pageIds],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, clearSelection]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{query.data ? `${total} ${total === 1 ? "contact" : "contacts"}` : " "}</p>
        </div>
        <Button onClick={() => navigate({ pathname: "/contacts/new", search: location.search })}>
          <PlusIcon /> New contact
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search any name, nickname, phone, email, tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={kind ?? ALL} onValueChange={(v) => setParam("kind", v)}>
          <SelectTrigger className="w-36" aria-label="Kind">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All kinds</SelectItem>
            {(Object.keys(KIND_LABELS) as ContactKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tag ?? ALL} onValueChange={(v) => setParam("tag", v)}>
          <SelectTrigger className="w-40" aria-label="Tag">
            <SelectValue placeholder="Any tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any tag</SelectItem>
            {(tags.data?.items ?? []).map((t) => (
              <SelectItem key={t.id} value={t.name}>
                {t.name} ({t.contactCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setParam("sort", v === "name" ? undefined : v)}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: name</SelectItem>
            <SelectItem value="lastContacted">Sort: last spoke</SelectItem>
            <SelectItem value="updated">Sort: recently updated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setParam("status", v === "active" ? undefined : v)}>
          <SelectTrigger className="w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">
              <span className="flex items-center gap-1.5">
                <ArchiveIcon className="size-3.5" /> Archived
              </span>
            </SelectItem>
            <SelectItem value="deceased">† Deceased</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          ids={[...selected]}
          pageIds={pageIds}
          onSelectAll={() => setSelected((prev) => new Set([...prev, ...pageIds]))}
          onClear={clearSelection}
        />
      )}

      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <ListSkeleton />
      ) : query.data.items.length === 0 ? (
        <EmptyState hasFilters={!!(q || kind || tag || archived || deceased)} />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Name</TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
                <TableHead>Last spoke</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((c) => (
                <ContactRow key={c.id} contact={c} selected={selected.has(c.id)} onToggle={(e) => toggleSelect(c.id, e)} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button variant="outline" size="icon-sm" disabled={page === 0} onClick={() => setParam("page", String(page - 1), false)} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page + 1 >= pages} onClick={() => setParam("page", String(page + 1), false)} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      )}

      <ContactFormDialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!o) navigate({ pathname: "/contacts", search: location.search }, { replace: true });
        }}
        onCreated={(c) => navigate(`/contacts/${c.id}`)}
      />
    </div>
  );
}

function ContactRow({ contact, selected, onToggle }: { contact: ContactSummary; selected: boolean; onToggle: (e: React.MouseEvent) => void }) {
  const last = contact.lastInteraction;
  return (
    <TableRow className={cn(selected && "bg-primary/5 hover:bg-primary/10")} data-state={selected ? "selected" : undefined}>
      <TableCell>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-pressed={selected}
            aria-label={selected ? `Deselect ${contact.displayName}` : `Select ${contact.displayName}`}
            title="Click to select · Shift+click for a range"
            className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(e);
            }}
          >
            <ContactAvatar contact={contact} className={cn("size-9 transition-opacity", selected && "opacity-30")} />
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-full border-2 transition-opacity",
                selected ? "border-primary bg-primary/20 text-primary opacity-100" : "border-transparent opacity-0 group-hover:border-muted-foreground/40 group-hover:opacity-100",
              )}
            >
              {selected && <CheckIcon className="size-5" />}
            </span>
          </button>
          <Link to={`/contacts/${contact.id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{contact.displayName}</span>
              <KindBadge kind={contact.kind} />
              {contact.deceasedAt && <DeceasedBadge on={contact.deceasedOn} />}
              {contact.archivedAt && (
                <span className="text-xs text-muted-foreground">
                  <ArchiveIcon className="inline size-3" /> archived
                </span>
              )}
            </div>
            {(contact.nickname || contact.animalType || contact.otherNames.length > 0 || contact.jobTitle || contact.employer) && (
              <div className="truncate text-xs text-muted-foreground">
                {[
                  contact.nickname && `“${contact.nickname}”`,
                  contact.animalType,
                  ...contact.otherNames.map((n) => n.value),
                  [contact.jobTitle, contact.employer?.displayName].filter(Boolean).join(" at "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </Link>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
        <div className="flex flex-col">
          {contact.primaryPhone && <span>{contact.primaryPhone}</span>}
          {contact.primaryEmail && <span className="truncate">{contact.primaryEmail}</span>}
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {last ? (
          <div className="flex flex-col">
            <span>{formatRelative(last.occurredAt)}</span>
            <span className="truncate text-xs text-muted-foreground" title={plainMentions(last.summary)}>
              <MentionText text={last.summary} chipClassName="font-medium text-foreground/80" />
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">No data</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
      <p className="font-medium">{hasFilters ? "No contacts match these filters" : "No contacts yet"}</p>
      <p className="text-sm text-muted-foreground">{hasFilters ? "Try clearing the search or filters." : "Add your first person, pet, or organisation."}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 py-12 text-center">
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
