import { ImagePlusIcon, RotateCcwIcon, SendIcon, SquareIcon, XIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { mentionMarkdown } from "@shared/mentions";
import { toast } from "sonner";
import { MessageList } from "@/components/ask/MessageList";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Button } from "@/components/ui/button";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { useAsk, useAskConfig, useAskUsage } from "@/lib/queries/ask";

export function AskPage() {
  const ask = useAsk();
  const config = useAskConfig();
  const usage = useAskUsage();
  const qc = useQueryClient();
  useEffect(() => {
    if (ask.status !== "streaming") void qc.invalidateQueries({ queryKey: ["ask", "usage"] });
  }, [ask.status, qc]);
  const [question, setQuestion] = useState("");
  /** Contacts picked with @ in this draft, by display name; expanded to id-carrying links on send. */
  const mentionsRef = useRef(new Map<string, string>());
  const [image, setImage] = useState<PreparedImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = ask.status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [ask.turns]);

  const attach = async (file: Blob | undefined) => {
    if (!file) return;
    try {
      setImage(await prepareImage(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach that image");
    }
  };

  const submit = () => {
    const q = question.trim();
    if (!q || streaming) return;
    void ask.send(expandMentions(q, mentionsRef.current), image ?? undefined);
    setQuestion("");
    mentionsRef.current = new Map();
    setImage(null);
  };

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col gap-4 md:h-[calc(100svh-6rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
          <p className="text-sm text-muted-foreground">
            Ask about your people, history and relationships. {config.data ? `Answering with ${config.data.label}.` : ""}
          </p>
          {usage.data && (
            <p className="text-xs text-muted-foreground">
              Today: {usage.data.requests} of {usage.data.budget.requestsPerDay} questions, {(usage.data.inputTokens + usage.data.outputTokens).toLocaleString()} of{" "}
              {usage.data.budget.tokensPerDay.toLocaleString()} tokens.
            </p>
          )}
        </div>
        {ask.turns.length > 0 && (
          <Button variant="outline" size="sm" onClick={ask.reset}>
            <RotateCcwIcon /> New conversation
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border p-4">
        {ask.turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p>Try: “When did I last speak to Alice, and what about?”</p>
            <p>“Who introduced me to the vet Rex goes to?”</p>
            <p>Paste a screenshot of a chat and ask “Log this.”</p>
          </div>
        ) : (
          <MessageList turns={ask.turns} streaming={streaming} onProposalChange={ask.markProposal} />
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex flex-col gap-2 rounded-xl border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {image && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <img src={image.previewUrl} alt="" className="h-12 rounded" />
            <span>
              {image.width}×{image.height}
            </span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove image" onClick={() => setImage(null)}>
              <XIcon />
            </Button>
          </div>
        )}
        <MentionTextarea
          value={question}
          rows={2}
          placement="above"
          placeholder="Ask a question… @ to mention a contact · Enter to send, Shift+Enter for a new line · paste an image to attach it"
          onChange={setQuestion}
          mentionStyle="plain"
          onMention={(c) => mentionsRef.current.set(c.displayName, c.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => {
            const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
            if (item) {
              e.preventDefault();
              void attach(item.getAsFile() ?? undefined);
            }
          }}
          className="resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={streaming}>
            <ImagePlusIcon /> Image
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void attach(e.target.files?.[0])} />
          <span className="flex-1" />
          {streaming ? (
            <Button type="button" variant="outline" size="sm" onClick={ask.stop}>
              <SquareIcon /> Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!question.trim()}>
              <SendIcon /> Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Turn plain "@Name" tokens for contacts picked in this draft into [@Name](/contacts/id) links; longest names first so "Ann Lee" beats "Ann". */
function expandMentions(text: string, picked: Map<string, string>): string {
  let out = text;
  for (const name of [...picked.keys()].sort((a, b) => b.length - a.length)) {
    const token = `@${name}`;
    const link = mentionMarkdown(name, picked.get(name)!);
    let idx = 0;
    let result = "";
    for (;;) {
      const at = out.indexOf(token, idx);
      if (at < 0) {
        result += out.slice(idx);
        break;
      }
      const before = at === 0 ? "" : out[at - 1]!;
      const after = out[at + token.length] ?? "";
      // Only whole tokens at a word start: skips e-mail addresses and links already expanded.
      const isMention = (before === "" || /[\s(]/.test(before)) && !/\w/.test(after);
      result += out.slice(idx, at) + (isMention ? link : token);
      idx = at + token.length;
    }
    out = result;
  }
  return out;
}
