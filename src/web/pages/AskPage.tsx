import { ArrowDownIcon, HistoryIcon, ImagePlusIcon, RotateCcwIcon, SendIcon, SquareIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { mentionMarkdown } from "@shared/mentions";
import { ASK_IMAGES_MAX_TOTAL_BYTES, ASK_MAX_IMAGES } from "@shared/schemas/ask";
import { toast } from "sonner";
import { ConversationList } from "@/components/ask/ConversationList";
import { ImagePreviewDialog } from "@/components/ask/ImagePreviewDialog";
import { MessageList } from "@/components/ask/MessageList";
import { QuickReplies } from "@/components/ask/QuickReplies";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { useAsk, useAskConfig } from "@/lib/queries/ask";

export function AskPage() {
  const ask = useAsk();
  const config = useAskConfig();
  const [params, setParams] = useSearchParams();
  /** `?c=<id>` is the conversation on screen, so a reload or the back button returns to it; no `c` = a new conversation. */
  const wanted = params.get("c");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [question, setQuestion] = useState("");
  /** Contacts picked with @ in this draft, by display name; expanded to id-carrying links on send. */
  const mentionsRef = useRef(new Map<string, string>());
  const [images, setImages] = useState<PreparedImage[]>([]);
  /** The draft image shown large; null = none. */
  const [previewing, setPreviewing] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = ask.status === "streaming";
  const loading = ask.status === "loading";
  /** False once the user has scrolled up to read: new text then stops pulling the view down and a "jump to latest" button appears. */
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [ask.turns, scrollToBottom]);

  // The URL drives which conversation is shown; the hook only writes it back once a new conversation has been saved.
  const { id: currentId, open, reset } = ask;
  useEffect(() => {
    if (wanted === currentId) return;
    if (wanted) {
      void open(wanted).then((ok) => {
        if (!ok) setParams({}, { replace: true });
      });
    } else {
      reset();
    }
    atBottomRef.current = true;
    // currentId is left out on purpose: when it changes because a save created the row, the URL catches up below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const lastIdRef = useRef(currentId);
  useEffect(() => {
    // A new conversation got its id from its first save: put it in the URL without adding a history entry.
    if (currentId && lastIdRef.current === null && wanted === null) setParams({ c: currentId }, { replace: true });
    lastIdRef.current = currentId;
  }, [currentId, wanted, setParams]);

  const goTo = (id: string | null) => {
    setHistoryOpen(false);
    // A new conversation whose first save has not come back yet has no `c` to drop, so start afresh directly.
    if (id === null && wanted === null) reset();
    else if (id !== wanted) setParams(id ? { c: id } : {});
  };
  const onDeleted = (id: string) => {
    if (id === currentId) setParams({}, { replace: true });
  };

  /** Adds to the images already on the draft, up to ASK_MAX_IMAGES and ASK_IMAGES_MAX_TOTAL_BYTES between them. */
  const attach = async (files: Blob[]) => {
    if (!files.length) return;
    const room = ASK_MAX_IMAGES - images.length;
    if (files.length > room) toast.error(`Up to ${ASK_MAX_IMAGES} images per question${room > 0 ? `; attached the first ${room}` : ""}`);
    const prepared: PreparedImage[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        prepared.push(await prepareImage(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not attach that image");
      }
    }
    if (!prepared.length) return;
    setImages((current) => {
      const next = [...current];
      let bytes = current.reduce((n, i) => n + i.file.size, 0);
      for (const img of prepared) {
        if (next.length >= ASK_MAX_IMAGES) break;
        if (bytes + img.file.size > ASK_IMAGES_MAX_TOTAL_BYTES) {
          toast.error(`The images are too large together (${Math.round(ASK_IMAGES_MAX_TOTAL_BYTES / 1024 / 1024)} MB max)`);
          break;
        }
        next.push(img);
        bytes += img.file.size;
      }
      return next;
    });
  };

  const submit = () => {
    const q = question.trim();
    if (!q || streaming || loading) return;
    void ask.send(expandMentions(q, mentionsRef.current), images);
    setQuestion("");
    mentionsRef.current = new Map();
    setImages([]);
  };

  /** A tapped quick reply goes as-is; an unsent draft stays in the box for the next message. */
  const reply = (text: string) => {
    if (streaming || loading) return;
    void ask.send(text);
  };
  const lastTurn = ask.turns.at(-1);
  /** The latest answer's quick replies; they sit in the composer until anything is sent. */
  const suggestions = !streaming && !loading && lastTurn?.role === "assistant" ? (lastTurn.suggestions ?? []) : [];

  return (
    <div className="flex h-[calc(100svh-4rem)] gap-6 md:h-[calc(100svh-6rem)]">
      <ConversationList currentId={currentId} onOpen={goTo} onNew={() => goTo(null)} onDeleted={onDeleted} className="hidden w-60 shrink-0 md:flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
            <p className="text-sm text-muted-foreground">
              Ask about your people, history and relationships. {config.data ? `Answering with ${config.data.label}.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden">
                  <HistoryIcon /> History
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-3">
                <SheetTitle className="text-base">Conversations</SheetTitle>
                <ConversationList currentId={currentId} onOpen={goTo} onNew={() => goTo(null)} onDeleted={onDeleted} className="flex-1" />
              </SheetContent>
            </Sheet>
            {ask.turns.length > 0 && (
              <Button variant="outline" size="sm" className="md:hidden" onClick={() => goTo(null)}>
                <RotateCcwIcon /> New
              </Button>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={onListScroll} className="h-full overflow-y-auto rounded-xl border p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading conversation…</div>
            ) : ask.turns.length === 0 ? (
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
          {!atBottom && ask.turns.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Scroll to latest"
              title="Scroll to latest"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
              onClick={() => scrollToBottom("smooth")}
            >
              <ArrowDownIcon />
            </Button>
          )}
        </div>

        <form
          className="flex flex-col gap-2 rounded-xl border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {suggestions.length > 0 && <QuickReplies replies={suggestions} onPick={reply} />}
          {images.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
              {images.map((img, i) => (
                <div key={img.previewUrl} className="relative">
                  <button type="button" aria-label={images.length > 1 ? `Preview image ${i + 1}` : "Preview image"} className="block cursor-zoom-in rounded" onClick={() => setPreviewing(i)}>
                    <img src={img.previewUrl} alt="" className="h-16 rounded" />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={images.length > 1 ? `Remove image ${i + 1}` : "Remove image"}
                    className="absolute top-1 right-1 size-7 rounded-full border shadow-sm"
                    onClick={() => {
                      setPreviewing(null);
                      setImages((current) => current.filter((x) => x !== img));
                    }}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ))}
              {images.length > 1 && (
                <span>
                  {images.length} of {ASK_MAX_IMAGES} images
                </span>
              )}
            </div>
          )}
          <ImagePreviewDialog images={images} index={previewing} onIndexChange={setPreviewing} />
          <MentionTextarea
            value={question}
            rows={2}
            placement="above"
            placeholder={
              suggestions.length > 0
                ? "Or type a different answer."
                : "Ask a question… @ to mention a contact · Enter to send, Shift+Enter for a new line · paste images to attach them"
            }
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
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                void attach(files);
              }
            }}
            className="resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={streaming || images.length >= ASK_MAX_IMAGES}>
              <ImagePlusIcon /> Images
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void attach([...(e.target.files ?? [])]);
                // Choosing the same file again should still fire a change.
                e.target.value = "";
              }}
            />
            <span className="flex-1" />
            {streaming ? (
              <Button type="button" variant="outline" size="sm" onClick={ask.stop}>
                <SquareIcon /> Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!question.trim() || loading}>
                <SendIcon /> Send
              </Button>
            )}
          </div>
        </form>
      </div>
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
