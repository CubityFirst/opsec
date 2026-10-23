import { MENTION_RE } from "@shared/mentions";
import { ContactPeek } from "@/components/contacts/ContactPeek";
import { ImageOffIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import type { AskTurn, AskTurnImage } from "@/lib/queries/ask";
import { ImagePreviewDialog } from "./ImagePreviewDialog";
import { ProposalCard, type ProposalPatch } from "./ProposalCard";
import { ApplyAllButton, proposalContext } from "./ProposalQueue";
import { ToolTrail } from "./ToolTrail";

export function MessageList({
  turns,
  streaming,
  onProposalChange,
}: {
  turns: AskTurn[];
  streaming: boolean;
  onProposalChange: (id: string, patch: ProposalPatch) => void;
}) {
  /** The sent images shown large: which question's, and which of them. */
  const [preview, setPreview] = useState<{ images: AskTurnImage[]; index: number } | null>(null);
  /** The images of the latest question with any, up to the turn being rendered: what an interaction proposal's attachImages numbers. */
  let latestImages: AskTurnImage[] = [];
  return (
    <div className="flex flex-col gap-4">
      {turns.map((t, idx) => {
        const isLast = idx === turns.length - 1;
        // A question whose images this tab no longer has still resets them, as the server counts it too.
        if (t.role === "user" && t.hadImages) latestImages = t.images ?? [];
        if (t.role === "user") {
          return (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
                {t.images?.length ? (
                  <div className={t.images.length > 1 ? "mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3" : "mb-2"}>
                    {t.images.map((img, i, all) => (
                      <button
                        key={img.previewUrl}
                        type="button"
                        aria-label={all.length > 1 ? `Preview image ${i + 1}` : "Preview image"}
                        className="block cursor-zoom-in rounded-md"
                        onClick={() => setPreview({ images: all, index: i })}
                      >
                        <img
                          src={img.previewUrl}
                          alt={all.length > 1 ? `attached ${i + 1}` : "attached"}
                          className={all.length > 1 ? "aspect-square w-full rounded-md object-cover" : "max-h-48 rounded-md"}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  !!t.hadImages && (
                    <p className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
                      <ImageOffIcon className="size-3.5" /> {t.hadImages === 1 ? "Image not kept" : `${t.hadImages} images not kept`}
                    </p>
                  )
                )}
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
                <ProposalList proposals={t.proposals} images={latestImages} onChange={(id, patch) => onProposalChange(id, patch)} />
              )}
              {t.error && <p className="text-sm text-destructive">{t.error}</p>}
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
      <ImagePreviewDialog images={preview?.images ?? []} index={preview?.index ?? null} onIndexChange={(index) => setPreview(index === null ? null : preview && { ...preview, index })} />
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

function ProposalList({
  proposals,
  images,
  onChange,
}: {
  proposals: Extract<AskTurn, { role: "assistant" }>["proposals"];
  images: AskTurnImage[];
  onChange: (id: string, patch: ProposalPatch) => void;
}) {
  const context = proposalContext(proposals);
  const open = proposals.filter((p) => !p.applied && !p.dismissed);
  return (
    <>
      {open.length > 1 && <ApplyAllButton proposals={proposals} context={context} onChange={onChange} />}
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} context={context} images={images} onChange={(patch) => onChange(p.id, patch)} />
      ))}
    </>
  );
}
