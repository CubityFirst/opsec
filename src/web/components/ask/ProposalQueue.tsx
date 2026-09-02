import { plainMentions } from "@shared/mentions";
import { useQueryClient } from "@tanstack/react-query";
import { ListChecksIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AskProposal } from "@shared/schemas/ask";
import type { ContactDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { applyRequest, blockedBy, substitutePending, type ProposalResults } from "@/lib/proposals";
import type { ProposalContext, ProposalPatch } from "./ProposalCard";

type Proposal = AskProposal & { applied?: boolean; dismissed?: boolean; result?: unknown };

function titleOf(p: Proposal): string {
  return p.kind === "action" ? p.title : p.kind === "interaction" ? `Log “${plainMentions(p.input.summary)}”` : `Note for ${p.contact.displayName}`;
}

export function proposalContext(proposals: Proposal[]): ProposalContext {
  const results: ProposalResults = {};
  for (const p of proposals) if (p.applied) results[p.id] = p.result ?? null;
  return { results, titleOf: (id) => titleOf(proposals.find((p) => p.id === id) ?? ({ kind: "action", title: "an earlier step" } as Proposal)) };
}

/**
 * Applies every open proposal in order, feeding each result into the next so
 * placeholders resolve. Interaction proposals need the review dialog, so they
 * are skipped and left for the user.
 */
export function ApplyAllButton({ proposals, context, onChange }: { proposals: Proposal[]; context: ProposalContext; onChange: (id: string, patch: ProposalPatch) => void }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const open = proposals.filter((p) => !p.applied && !p.dismissed);
  // Deletions and archives are never batched: each keeps its own red button.
  const automatic = open.filter((p) => p.kind !== "interaction" && !(p.kind === "action" && p.destructive));
  const destructive = false;
  if (automatic.length < 2 && !(automatic.length === 1 && open.length > 1)) return null;

  const run = async () => {
    setRunning(true);
    const results: ProposalResults = { ...context.results };
    let applied = 0;
    try {
      for (const p of automatic) {
        if (blockedBy(p, results).length > 0) continue;
        if (p.kind === "action") {
          const result = await applyRequest(substitutePending(p.request, results));
          results[p.id] = result ?? null;
          onChange(p.id, { applied: true, result });
        } else if (p.kind === "contact_note") {
          const current = await api.get<ContactDetail>(`/api/contacts/${p.contact.id}`);
          const notes = current.notes ? `${current.notes.trimEnd()}\n\n${p.appendText}` : p.appendText;
          await api.patch(`/api/contacts/${p.contact.id}`, { notes });
          results[p.id] = null;
          onChange(p.id, { applied: true });
        }
        applied += 1;
      }
      await qc.invalidateQueries();
      const left = open.length - applied;
      toast.success(left > 0 ? `Applied ${applied}; ${left} left to review` : `Applied ${applied}`);
    } catch (e) {
      await qc.invalidateQueries();
      toast.error(`Stopped after ${applied}: ${errorMessage(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant={destructive ? "destructive" : "secondary"} disabled={running} onClick={() => void run()}>
        <ListChecksIcon /> Apply all {automatic.length} in order
      </Button>
      {open.length > automatic.length && <span className="text-xs text-muted-foreground">Interactions and deletions stay separate for review.</span>}
    </div>
  );
}
