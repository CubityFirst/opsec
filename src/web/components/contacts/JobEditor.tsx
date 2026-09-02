import { BriefcaseIcon, CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { ContactDetail, ContactRef } from "@shared/types";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/lib/api";
import { useUpdateContact } from "@/lib/queries/contacts";
import { cn } from "@/lib/utils";

/**
 * The "Title at Employer" line under a person's name. Clicking it opens an
 * inline editor; saving goes through the normal contact PATCH, so the employer
 * relationship stays in step.
 */
export function JobEditor({ contact }: { contact: ContactDetail }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(contact.jobTitle ?? "");
  const [employer, setEmployer] = useState<ContactRef | null>(contact.employer);
  const update = useUpdateContact(contact.id);
  const hasJob = !!(contact.jobTitle || contact.employer);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setTitle(contact.jobTitle ?? "");
      setEmployer(contact.employer);
    }
    setOpen(next);
  };

  const save = async (values: { jobTitle: string | null; employerContactId: string | null }) => {
    try {
      await update.mutateAsync(values);
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <p className="flex items-center gap-1 text-sm">
        <BriefcaseIcon className="size-3.5 text-muted-foreground" />
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("rounded px-1 text-left hover:bg-muted", !hasJob && "text-muted-foreground italic")}
            title="Edit job"
          >
            {hasJob ? (
              <>
                {contact.jobTitle && <span>{contact.jobTitle}</span>}
                {contact.jobTitle && contact.employer && <span className="text-muted-foreground"> at </span>}
                {contact.employer && <span className="font-medium">{contact.employer.displayName}</span>}
              </>
            ) : (
              "Add job"
            )}
          </button>
        </PopoverTrigger>
        {contact.employer && (
          <Link to={`/contacts/${contact.employer.id}`} className="text-xs text-muted-foreground hover:underline">
            open
          </Link>
        )}
      </p>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ jobTitle: title.trim() || null, employerContactId: employer?.id ?? null });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="job-title">Job title</Label>
            <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Audit Manager" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Employer</Label>
            <div className="flex items-center gap-2">
              <ContactPicker value={employer} onSelect={setEmployer} kinds={["organization"]} placeholder="Pick an organisation" className="min-w-0 flex-1" />
              {employer && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove employer" onClick={() => setEmployer(null)}>
                  <XIcon />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Keeps the employer relationship in step. The organisation must already be a contact.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              <CheckIcon /> Save
            </Button>
            {hasJob && (
              <Button type="button" size="sm" variant="ghost" disabled={update.isPending} onClick={() => void save({ jobTitle: null, employerContactId: null })}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
