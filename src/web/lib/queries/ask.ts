import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";
import {
  ASK_MAX_HISTORY_TURNS,
  type AskConfig,
  type AskConversationOut,
  type AskConversationSummary,
  type AskEvent,
  type AskImage,
  type AskProposal,
  type AskStop,
  type AskStoredTurn,
} from "@shared/schemas/ask";
import { api, errorMessage } from "../api";
import { streamEvents } from "../sse";

/** The browser's IANA zone, so the server can read "9am" as 9am here; undefined if the runtime does not know. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function useAskConfig() {
  return useQuery({ queryKey: ["ask", "config"], queryFn: () => api.get<AskConfig>("/api/ask/config"), staleTime: Infinity });
}

export interface TrailItem {
  id: string;
  name: string;
  label: string;
  input: unknown;
  ok?: boolean;
  summary?: string;
}

/** An image the user sent: shown in their bubble, and kept so an interaction proposal can attach it. */
export interface AskTurnImage {
  previewUrl: string;
  file: File;
}

export type AskTurn =
  /** `hadImage`: the question carried an image this tab no longer has (saved conversations never keep images). */
  | { role: "user"; text: string; image?: AskTurnImage; hadImage?: boolean }
  | {
      role: "assistant";
      text: string;
      trail: TrailItem[];
      proposals: (AskProposal & { applied?: boolean; dismissed?: boolean; result?: unknown })[];
      /** Quick replies offered under this message; shown only while it is the latest turn. */
      suggestions?: string[];
      done?: { stop: AskStop; iterations: number };
      error?: string;
    };

interface State {
  /** The saved conversation on screen; null until its first question has been saved. */
  id: string | null;
  turns: AskTurn[];
  status: "idle" | "streaming" | "loading";
  /** Bumped by every change worth saving (a question, a finished answer, a proposal applied); streamed deltas do not count. */
  rev: number;
}

type Action =
  | { type: "start"; question: string; image?: AskTurnImage }
  | { type: "event"; event: AskEvent }
  | { type: "fail"; message: string }
  | { type: "finish" }
  | { type: "proposal"; id: string; patch: { applied?: boolean; dismissed?: boolean; result?: unknown } }
  | { type: "saved"; id: string }
  | { type: "loading"; id: string }
  | { type: "loaded"; id: string; turns: AskTurn[] }
  | { type: "reset" };

function updateLastAssistant(turns: AskTurn[], fn: (t: Extract<AskTurn, { role: "assistant" }>) => AskTurn): AskTurn[] {
  const idx = turns.length - 1;
  const last = turns[idx];
  if (!last || last.role !== "assistant") return turns;
  return [...turns.slice(0, idx), fn(last)];
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return {
        ...state,
        status: "streaming",
        rev: state.rev + 1,
        turns: [...state.turns, { role: "user", text: action.question, image: action.image }, { role: "assistant", text: "", trail: [], proposals: [] }],
      };
    case "event": {
      const e = action.event;
      return {
        ...state,
        turns: updateLastAssistant(state.turns, (t) => {
          switch (e.type) {
            case "text":
              return { ...t, text: t.text + e.delta };
            case "tool_call":
              return { ...t, trail: [...t.trail, { id: e.id, name: e.name, label: e.label, input: e.input }] };
            case "tool_result":
              return { ...t, trail: t.trail.map((x) => (x.id === e.id ? { ...x, ok: e.ok, summary: e.summary } : x)) };
            case "proposal":
              return { ...t, proposals: [...t.proposals, e.proposal] };
            case "suggestions":
              return { ...t, suggestions: e.replies };
            case "done":
              return { ...t, done: { stop: e.stop, iterations: e.iterations } };
            case "error":
              return { ...t, error: e.message };
          }
        }),
      };
    }
    case "fail":
      return { ...state, status: "idle", rev: state.rev + 1, turns: updateLastAssistant(state.turns, (t) => ({ ...t, error: action.message })) };
    case "finish":
      return { ...state, status: "idle", rev: state.rev + 1 };
    case "proposal":
      return {
        ...state,
        rev: state.rev + 1,
        turns: state.turns.map((t) => (t.role === "assistant" ? { ...t, proposals: t.proposals.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) } : t)),
      };
    case "saved":
      return { ...state, id: action.id };
    case "loading":
      return { id: action.id, turns: [], status: "loading", rev: 0 };
    case "loaded":
      return action.id === state.id ? { ...state, turns: action.turns, status: "idle" } : state;
    case "reset":
      return { id: null, turns: [], status: "idle", rev: 0 };
  }
}

/** What the server keeps: an image becomes a flag, and an answer that never got going (page closed mid-question) is dropped. */
function toStored(turns: AskTurn[]): AskStoredTurn[] {
  const out: AskStoredTurn[] = [];
  for (const t of turns) {
    if (t.role === "user") out.push({ role: "user", text: t.text, image: t.image || t.hadImage ? true : undefined });
    else if (t.text || t.trail.length || t.proposals.length || t.error) out.push(t);
  }
  return out;
}

function fromStored(turns: AskStoredTurn[], images: Map<number, AskTurnImage>): AskTurn[] {
  let question = 0;
  return turns.map((t): AskTurn => {
    if (t.role === "assistant") return { ...t, proposals: t.proposals as Extract<AskTurn, { role: "assistant" }>["proposals"] };
    const n = question++;
    return { role: "user", text: t.text, image: t.image ? images.get(n) : undefined, hadImage: t.image };
  });
}

/**
 * One conversation as this tab knows it. Its saves run one after another, so
 * the first (which creates the row) lands before the updates, and they still
 * reach the right row after the user has switched to another conversation.
 */
interface Conversation {
  id: string | null;
  /** Images sent from this tab, by question number (0 = the first): never saved, but they survive switching away and back. */
  images: Map<number, AskTurnImage>;
  queue: Promise<void>;
}

const newConversation = (id: string | null = null): Conversation => ({ id, images: new Map(), queue: Promise.resolve() });
/** Conversations opened in this tab, so going back to one finds its images and its pending saves. */
const seen = new Map<string, Conversation>();

const CONVERSATIONS_KEY = ["ask", "conversations"] as const;

export function useAskConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => api.get<{ items: AskConversationSummary[] }>("/api/ask/conversations"),
    select: (d) => d.items,
  });
}

export function useDeleteAskConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/ask/conversations/${id}`),
    onSuccess: (_d, id) => {
      seen.delete(id);
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}

/** The conversation with the assistant; saved after every turn so the sidebar can reopen it. */
export function useAsk() {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(reduce, { id: null, turns: [], status: "idle", rev: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const convRef = useRef<Conversation>(newConversation());
  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback(
    (conv: Conversation, turns: AskTurn[]) => {
      const stored = toStored(turns);
      if (!stored.some((t) => t.role === "user")) return;
      conv.queue = conv.queue
        .then(async () => {
          if (conv.id) {
            await api.put(`/api/ask/conversations/${conv.id}`, { turns: stored });
          } else {
            const created = await api.post<AskConversationSummary>("/api/ask/conversations", { turns: stored });
            conv.id = created.id;
            seen.set(created.id, conv);
            if (convRef.current === conv) dispatch({ type: "saved", id: created.id });
          }
          await qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
        })
        .catch((e) => {
          toast.error(`Could not save this conversation: ${errorMessage(e)}`);
        });
    },
    [qc],
  );

  // Only a new revision is worth saving; `turns` changes with every streamed word.
  useEffect(() => {
    if (stateRef.current.rev > 0) persist(convRef.current, stateRef.current.turns);
  }, [state.rev, persist]);

  /** Leave the conversation on screen; an answer still streaming is stopped and saved as far as it got. */
  const leave = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "streaming") return;
    abortRef.current?.abort();
    persist(convRef.current, updateLastAssistant(current.turns, (t) => ({ ...t, error: "Stopped." })));
  }, [persist]);

  // Leaving the page mid-answer keeps what has arrived instead of losing the turn.
  useEffect(() => leave, [leave]);

  const send = useCallback(
    async (question: string, image?: AskImage & AskTurnImage) => {
      if (state.status !== "idle") return;
      const history = state.turns
        .map((t) => ({ role: t.role, text: t.text, image: t.role === "user" && (t.image || t.hadImage) ? true : undefined }))
        .filter((t) => t.text.trim().length > 0)
        .slice(-ASK_MAX_HISTORY_TURNS);
      const conv = convRef.current;
      const turnImage = image && { previewUrl: image.previewUrl, file: image.file };
      if (turnImage) conv.images.set(state.turns.filter((t) => t.role === "user").length, turnImage);
      dispatch({ type: "start", question, image: turnImage });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // A stream the user has walked away from must not write into the conversation now on screen.
      const mine = () => convRef.current === conv;
      try {
        const body = { messages: history, question, image: image ? { mediaType: image.mediaType, data: image.data } : undefined, timeZone: browserTimeZone() };
        for await (const event of streamEvents<AskEvent>("/api/ask", body, ctrl.signal)) {
          if (mine()) dispatch({ type: "event", event });
        }
        if (mine()) dispatch({ type: "finish" });
      } catch (e) {
        if (mine()) dispatch({ type: "fail", message: ctrl.signal.aborted ? "Stopped." : errorMessage(e) });
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [state.status, state.turns],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    leave();
    convRef.current = newConversation();
    dispatch({ type: "reset" });
  }, [leave]);

  /** Show a saved conversation. Resolves false when it cannot be loaded (deleted, or not this user's); the view is then a new conversation. */
  const open = useCallback(
    async (id: string): Promise<boolean> => {
      leave();
      const conv = seen.get(id) ?? newConversation(id);
      convRef.current = conv;
      dispatch({ type: "loading", id });
      try {
        // Saves still on their way for this conversation land first, so what loads is current.
        await conv.queue;
        const out = await api.get<AskConversationOut>(`/api/ask/conversations/${id}`);
        seen.set(id, conv);
        if (convRef.current === conv) dispatch({ type: "loaded", id, turns: fromStored(out.turns, conv.images) });
        return true;
      } catch (e) {
        if (convRef.current === conv) {
          convRef.current = newConversation();
          dispatch({ type: "reset" });
        }
        toast.error(`Could not open that conversation: ${errorMessage(e)}`);
        return false;
      }
    },
    [leave],
  );

  const markProposal = useCallback((id: string, patch: { applied?: boolean; dismissed?: boolean; result?: unknown }) => dispatch({ type: "proposal", id, patch }), []);

  return { id: state.id, turns: state.turns, status: state.status, send, stop, reset, open, markProposal };
}
