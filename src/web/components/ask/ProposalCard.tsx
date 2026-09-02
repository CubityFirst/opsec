import { MentionText } from "@/components/MentionText";
import { ArrowRightIcon, CheckIcon, ClockIcon, FilePenLineIcon, MessageSquarePlusIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AskProposal } from "@shared/schemas/ask";
import type { ContactDetail } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, formatDateTime } from "@/lib/format";
import { applyRequest, blockedBy, resolveParticipants, substitutePending, type ProposalResults } from "@/lib/proposals";
import { useUpdateContact } from "@/lib/queries/contacts";

export type ProposalPatch = { applied?: boolean; dismissed?: boolean; result?: unknown };
type Proposal = AskProposal & { applied?: boolean; dismissed?: boolean; result?: unknown };

export interface ProposalContext {
  /** Results of proposals already applied in this turn, by proposal id. */
  results: ProposalResults;
  titleOf: (proposalId: string) => string;
}

/** A drafted action from the assistant. Nothing is written until Apply. */
export function ProposalCard({ proposal, context, onChange }: { proposal: Proposal; context: ProposalContext; onChange: (patch: ProposalPatch) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  if (proposal.dismissed) return null;
  const waiting = proposal.applied ? [] : blockedBy(proposal, context.results);
  const blocked = waiting.length > 0;
  const participants = proposal.kind === "interaction" ? resolveParticipants(proposal.participants, context.results) : [];

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {proposal.kind === "interaction" ? (
            <MessageSquarePlusIcon className="size-4 text-primary" />
          ) : proposal.kind === "action" ? (
            <WandSparklesIcon className="size-4 text-primary" />
          ) : (
            <FilePenLineIcon className="size-4 text-primary" />
          )}
          <span className="text-sm font-medium">
            {proposal.kind === "interaction" ? "Proposed interaction" : proposal.kind === "action" ? proposal.title : "Proposed note"}
          </span>
          {proposal.applied && (
            <Badge variant="secondary">
              <CheckIcon className="size-3" /> Applied
            </Badge>
          )}
          {blocked && (
            <Badge variant="outline" className="text-muted-foreground">
              <ClockIcon className="size-3" /> After: {waiting.map(context.titleOf).join(", ")}
            </Badge>
          )}
        </div>

        {proposal.kind === "interaction" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{INTERACTION_LABELS[proposal.input.type]}</Badge>
              <span className="text-muted-foreground">{formatDateTime(proposal.input.occurredAt)}</span>
              {participants.map((p) => (
                <span key={p.id} className="flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-xs">
                  <ContactAvatar contact={p} className="size-4" /> {p.displayName}
                </span>
              ))}
            </div>
            <p className="font-medium">
              <MentionText text={proposal.input.summary} />
            </p>
            {proposal.input.body && <MarkdownBody className="text-sm text-muted-foreground">{proposal.input.body}</MarkdownBody>}
          </>
        ) : proposal.kind === "action" ? (
          <>
            {proposal.contact && (
              <div className="flex items-center gap-2 text-sm">
                <ContactAvatar contact={proposal.contact} className="size-5" /> {proposal.contact.displayName}
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {proposal.changes.map((ch, idx) => (
                <div key={`${ch.label}-${idx}`} className="contents">
                  <dt className="text-muted-foreground">{ch.label}</dt>
                  <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {ch.from !== null && <span className={ch.to === null ? "text-destructive line-through" : "text-muted-foreground line-through"}>{ch.from}</span>}
                    {ch.from !== null && ch.to !== null && <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />}
                    {ch.to !== null && <span className="font-medium whitespace-pre-wrap">{ch.to}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <ContactAvatar contact={proposal.contact} className="size-5" /> {proposal.contact.displayName}
            </div>
            <MarkdownBody className="text-sm text-muted-foreground">{proposal.appendText}</MarkdownBody>
          </>
        )}

        {!proposal.applied && (
          <div className="flex gap-2">
            {proposal.kind === "interaction" ? (
              <Button size="sm" disabled={blocked} onClick={() => setDialogOpen(true)}>
                <CheckIcon /> Review &amp; apply
              </Button>
            ) : proposal.kind === "action" ? (
              <ApplyActionButton proposal={proposal} results={context.results} disabled={blocked} onApplied={(result) => onChange({ applied: true, result })} />
            ) : (
              <ApplyNoteButton proposal={proposal} onApplied={() => onChange({ applied: true })} />
            )}
            <Button size="sm" variant="ghost" onClick={() => onChange({ dismissed: true })}>
              <XIcon /> Dismiss
            </Button>
          </div>
        )}
      </CardContent>

      {proposal.kind === "interaction" && (
        <InteractionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialParticipants={participants}
          initialValues={{
            type: proposal.input.type,
            occurredAt: proposal.input.occurredAt,
            summary: proposal.input.summary,
            body: proposal.input.body ?? null,
            location: proposal.input.location ?? null,
          }}
          onSaved={() => onChange({ applied: true })}
        />
      )}
    </Card>
  );
}

function ApplyActionButton({
  proposal,
  results,
  disabled,
  onApplied,
}: {
  proposal: Extract<AskProposal, { kind: "action" }>;
  results: ProposalResults;
  disabled: boolean;
  onApplied: (result: unknown) => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const apply = async () => {
    setPending(true);
    try {
      const result = await applyRequest(substitutePending(proposal.request, results));
      await qc.invalidateQueries();
      toast.success("Applied");
      onApplied(result);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Button size="sm" variant={proposal.destructive ? "destructive" : "default"} disabled={pending || disabled} onClick={() => void apply()}>
      <CheckIcon /> {proposal.destructive ? "Apply (cannot be undone)" : "Apply"}
    </Button>
  );
}

function ApplyNoteButton({ proposal, onApplied }: { proposal: Extract<AskProposal, { kind: "contact_note" }>; onApplied: () => void }) {
  const update = useUpdateContact(proposal.contact.id);
  const apply = async () => {
    try {
      const current = await api.get<ContactDetail>(`/api/contacts/${proposal.contact.id}`);
      const notes = current.notes ? `${current.notes.trimEnd()}\n\n${proposal.appendText}` : proposal.appendText;
      await update.mutateAsync({ notes });
      toast.success("Note added");
      onApplied();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Button size="sm" disabled={update.isPending} onClick={() => void apply()}>
      <CheckIcon /> Apply to notes
    </Button>
  );
}
