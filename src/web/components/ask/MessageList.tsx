import { MENTION_RE } from "@shared/mentions";
import { ContactPeek } from "@/components/contacts/ContactPeek";
import { SparklesIcon } from "lucide-react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/button";
import type { AskTurn } from "@/lib/queries/ask";
import { ProposalCard, type ProposalPatch } from "./ProposalCard";
import { ApplyAllButton, proposalContext } from "./ProposalQueue";
import { ToolTrail } from "./ToolTrail";

export function MessageList({
  turns,
  streaming,
  onProposalChange,
  onReply,
}: {
  turns: AskTurn[];
  streaming: boolean;
  onProposalChange: (id: string, patch: ProposalPatch) => void;
  /** A quick reply was tapped: send it as the next user message. */
  onReply: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {turns.map((t, idx) => {
        const isLast = idx === turns.length - 1;
        if (t.role === "user") {
          return (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
                {t.imagePreviewUrl && <img src={t.imagePreviewUrl} alt="attached" className="mb-2 max-h-48 rounded-md" />}
                <p className="whitespace-pre-wrap text-sm">
                  <UserText text={t.text} />
                </p>
              </div>
            </div>
          );
        }
        const live = streaming && isLast;
        return (
          <div key={idx} className="flex gap-3">
            <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <SparklesIcon className="size-4 text-muted-foreground" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <ToolTrail items={t.trail} streaming={live} />
              {t.text ? (
                <MarkdownBody className="text-sm">{t.text}</MarkdownBody>
              ) : live && t.trail.length === 0 ? (
                <p className="text-sm text-muted-foreground">Thinking…</p>
              ) : null}
              {t.proposals.length > 0 && (
                <ProposalList proposals={t.proposals} onChange={(id, patch) => onProposalChange(id, patch)} />
              )}
              {t.error && <p className="text-sm text-destructive">{t.error}</p>}
              {isLast && !live && t.suggestions && t.suggestions.length > 0 && <QuickReplies replies={t.suggestions} onPick={onReply} />}
              {t.done && t.done.stop !== "end_turn" && (
                <p className="text-xs text-muted-foreground">
                  {t.done.stop === "max_iterations"
                    ? "Stopped after the maximum number of lookups."
                    : t.done.stop === "max_tokens"
                      ? "The answer was cut short by the length limit."
                      : t.done.stop === "refusal"
                        ? "The model declined to answer this."
                        : null}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/** One-tap answers to the question above; anything typed in the box works too. */
function QuickReplies({ replies, onPick }: { replies: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
      {replies.map((r) => (
        <Button key={r} type="button" variant="outline" size="sm" className="h-auto whitespace-normal rounded-full text-left" onClick={() => onPick(r)}>
          {r}
        </Button>
      ))}
    </div>
  );
}

/** The user's own text: mention links become chips, everything else is verbatim. */
function UserText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <ContactPeek key={`${start}-${m[2]}`} id={m[2]!} className="rounded bg-primary-foreground/20 px-1 font-medium hover:bg-primary-foreground/30">
        @{m[1]}
      </ContactPeek>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ProposalList({ proposals, onChange }: { proposals: Extract<AskTurn, { role: "assistant" }>["proposals"]; onChange: (id: string, patch: ProposalPatch) => void }) {
  const context = proposalContext(proposals);
  const open = proposals.filter((p) => !p.applied && !p.dismissed);
  return (
    <>
      {open.length > 1 && <ApplyAllButton proposals={proposals} context={context} onChange={onChange} />}
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} context={context} onChange={(patch) => onChange(p.id, patch)} />
      ))}
    </>
  );
}
