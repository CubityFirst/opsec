import type { AskProposal } from "@shared/schemas/ask";
import { isPendingId, pendingProposalId } from "@shared/schemas/ask";
import type { ContactRef } from "@shared/types";
import { api } from "./api";

/** Results of applied proposals in a turn, keyed by proposal id (e.g. the created contact). */
export type ProposalResults = Record<string, unknown>;

function resultId(results: ProposalResults, proposalId: string): string | undefined {
  const r = results[proposalId];
  return r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" ? (r as { id: string }).id : undefined;
}

/** Replace `new:<proposalId>` placeholders (whole strings, or inside a path) with the ids of applied proposals. */
export function substitutePending<T>(value: T, results: ProposalResults): T {
  if (typeof value === "string") {
    if (isPendingId(value)) return (resultId(results, pendingProposalId(value)) ?? value) as T;
    return value.replace(/new:([0-9A-Z]{26})/g, (m, id: string) => resultId(results, id) ?? m) as T;
  }
  if (Array.isArray(value)) return value.map((v) => substitutePending(v, results)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitutePending(v, results)])) as T;
  }
  return value;
}

/** Participants of an interaction proposal with pending contacts swapped for the ones actually created. */
export function resolveParticipants(participants: ContactRef[], results: ProposalResults): ContactRef[] {
  return participants.map((p) => {
    if (!isPendingId(p.id)) return p;
    const r = results[pendingProposalId(p.id)] as Partial<ContactRef> | undefined;
    return r?.id ? { ...p, id: r.id, displayName: r.displayName ?? p.displayName, avatarUrl: r.avatarUrl ?? null } : p;
  });
}

/** Proposal ids this one still waits for. */
export function blockedBy(proposal: AskProposal, results: ProposalResults): string[] {
  const deps = "dependsOn" in proposal ? (proposal.dependsOn ?? []) : [];
  return deps.filter((id) => !(id in results));
}

/** Send an action proposal's request (placeholders already substituted) and return the response body. */
export async function applyRequest(request: Extract<AskProposal, { kind: "action" }>["request"]): Promise<unknown> {
  const { method, path, body } = request;
  // Defence in depth: proposals are server-built, but never let one point anywhere but our own API.
  if (!path.startsWith("/api/") || path.includes("..") || path.includes("?") || path.includes("#") || path.startsWith("/api/auth") || path.startsWith("/api/ai/")) {
    throw new Error(`Refusing to apply a proposal to ${path}`);
  }
  if (method === "POST") return api.post<unknown>(path, body);
  if (method === "PATCH") return api.patch<unknown>(path, body);
  if (method === "PUT") return api.put<unknown>(path, body);
  await api.del(path);
  return null;
}
