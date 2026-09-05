import { useQuery } from "@tanstack/react-query";
import { useCallback, useReducer, useRef } from "react";
import { ASK_MAX_HISTORY_TURNS, type AskConfig, type AskEvent, type AskImage, type AskProposal, type AskStop } from "@shared/schemas/ask";
import { api, errorMessage } from "../api";
import { streamEvents } from "../sse";

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

export type AskTurn =
  | { role: "user"; text: string; imagePreviewUrl?: string }
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
  turns: AskTurn[];
  status: "idle" | "streaming";
}

type Action =
  | { type: "start"; question: string; imagePreviewUrl?: string }
  | { type: "event"; event: AskEvent }
  | { type: "fail"; message: string }
  | { type: "finish" }
  | { type: "proposal"; id: string; patch: { applied?: boolean; dismissed?: boolean; result?: unknown } }
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
        status: "streaming",
        turns: [...state.turns, { role: "user", text: action.question, imagePreviewUrl: action.imagePreviewUrl }, { role: "assistant", text: "", trail: [], proposals: [] }],
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
      return { ...state, status: "idle", turns: updateLastAssistant(state.turns, (t) => ({ ...t, error: action.message })) };
    case "finish":
      return { ...state, status: "idle" };
    case "proposal":
      return {
        ...state,
        turns: state.turns.map((t) => (t.role === "assistant" ? { ...t, proposals: t.proposals.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) } : t)),
      };
    case "reset":
      return { turns: [], status: "idle" };
  }
}

/** Ephemeral conversation with the assistant; lives only in this component's state. */
export function useAsk() {
  const [state, dispatch] = useReducer(reduce, { turns: [], status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (question: string, image?: AskImage & { previewUrl?: string }) => {
      if (state.status === "streaming") return;
      const history = state.turns
        .filter((t) => t.role === "user" || t.role === "assistant")
        .map((t) => ({ role: t.role, text: t.text }))
        .filter((t) => t.text.trim().length > 0)
        .slice(-ASK_MAX_HISTORY_TURNS);
      dispatch({ type: "start", question, imagePreviewUrl: image?.previewUrl });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const body = { messages: history, question, image: image ? { mediaType: image.mediaType, data: image.data } : undefined };
        for await (const event of streamEvents<AskEvent>("/api/ask", body, ctrl.signal)) {
          dispatch({ type: "event", event });
        }
        dispatch({ type: "finish" });
      } catch (e) {
        dispatch({ type: "fail", message: ctrl.signal.aborted ? "Stopped." : errorMessage(e) });
      } finally {
        abortRef.current = null;
      }
    },
    [state.status, state.turns],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);
  const markProposal = useCallback((id: string, patch: { applied?: boolean; dismissed?: boolean; result?: unknown }) => dispatch({ type: "proposal", id, patch }), []);

  return { turns: state.turns, status: state.status, send, stop, reset, markProposal };
}
