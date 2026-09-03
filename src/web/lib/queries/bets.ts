import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BetCreateInput, BetListQuery, BetSettleInput, BetUpdateInput } from "@shared/schemas/bet";
import type { BetListResult, BetOut } from "@shared/types";
import { api, toQuery } from "../api";
import { betKeys, contactKeys } from "./keys";

export function useContactBets(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.bets(contactId ?? ""),
    queryFn: () => api.get<BetListResult>(`/api/contacts/${contactId}/bets?limit=200`),
    enabled: !!contactId,
  });
}

/** All bets, open first. `dueBy` narrows to open bets whose review date has arrived by that day. */
export function useBets(q: Partial<BetListQuery> = {}) {
  return useQuery({
    queryKey: betKeys.list(q),
    queryFn: () => api.get<BetListResult>(`/api/bets${toQuery({ limit: 200, ...q })}`),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (bet: BetOut | undefined, contactId: string) => {
    const id = bet?.contact.id ?? contactId;
    void qc.invalidateQueries({ queryKey: betKeys.all });
    void qc.invalidateQueries({ queryKey: contactKeys.bets(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
  };
}

export function useCreateBet(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: BetCreateInput) => api.post<BetOut>(`/api/contacts/${contactId}/bets`, input),
    onSuccess: (bet) => invalidate(bet, contactId),
  });
}

export function useUpdateBet(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BetUpdateInput }) => api.patch<BetOut>(`/api/bets/${id}`, input),
    onSuccess: (bet) => invalidate(bet, contactId),
  });
}

export function useSettleBet(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BetSettleInput }) => api.post<BetOut>(`/api/bets/${id}/settle`, input),
    onSuccess: (bet) => invalidate(bet, contactId),
  });
}

export function useReopenBet(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<BetOut>(`/api/bets/${id}/reopen`),
    onSuccess: (bet) => invalidate(bet, contactId),
  });
}

export function useDeleteBet(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/bets/${id}`),
    onSuccess: () => invalidate(undefined, contactId),
  });
}
