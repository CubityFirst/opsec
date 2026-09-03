import { BriefcaseIcon, CakeIcon, ExternalLinkIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { DeceasedBadge } from "@/components/contacts/DeceasedBadge";
import { KindBadge } from "@/components/contacts/KindBadge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { formatBirthday } from "@/lib/format";
import { useContact } from "@/lib/queries/contacts";
import { cn } from "@/lib/utils";

/**
 * Click-to-open mini profile for a contact mention: avatar, name, job,
 * birthday/age and a link to the full page. Data loads when first opened.
 */
export function ContactPeek({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn("cursor-pointer", className)}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        {open && <PeekBody id={id} onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function PeekBody({ id, onNavigate }: { id: string; onNavigate: () => void }) {
  const q = useContact(id);
  if (q.isError) return <p className="text-sm text-destructive">{errorMessage(q.error)}</p>;
  const c = q.data;
  if (!c) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }
  const job = c.kind === "person" && (c.jobTitle || c.employer) ? [c.jobTitle, c.employer?.displayName].filter(Boolean).join(" at ") : null;
  const dateLabel = c.kind === "organization" ? "Founded" : "Birthday";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ContactAvatar contact={c} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-medium">{c.displayName}</span>
            {c.pronouns && <span className="text-xs text-muted-foreground">{c.pronouns}</span>}
            {c.animalType && <span className="text-xs text-muted-foreground">{c.animalType}</span>}
            <KindBadge kind={c.kind} />
            {c.deceasedAt && <DeceasedBadge on={c.deceasedOn} />}
          </div>
          {c.nickname && <p className="truncate text-xs text-muted-foreground">“{c.nickname}”</p>}
        </div>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        {job && (
          <div className="flex items-center gap-2">
            <BriefcaseIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <dd className="truncate">{job}</dd>
          </div>
        )}
        <div className="flex items-center gap-2">
          <CakeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <dt className="sr-only">{dateLabel}</dt>
          <dd className={cn(!c.birthday && "text-muted-foreground")}>{c.birthday ? formatBirthday(c.birthday) : `No ${dateLabel.toLowerCase()}`}</dd>
        </div>
      </dl>
      <Button asChild size="sm" variant="outline" className="w-full">
        <Link to={`/contacts/${c.id}`} onClick={onNavigate}>
          <ExternalLinkIcon /> Open profile
        </Link>
      </Button>
    </div>
  );
}
