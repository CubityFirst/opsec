import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GiftCreateInput, GiftGiveInput, GiftListQuery, GiftUpdateInput } from "@shared/schemas/gift";
import type { GiftListResult, GiftOut } from "@shared/types";
import { api, toQuery } from "../api";
import { contactKeys, giftKeys } from "./keys";

export function useContactGifts(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.gifts(contactId ?? ""),
    queryFn: () => api.get<GiftListResult>(`/api/contacts/${contactId}/gifts?limit=200`),
    enabled: !!contactId,
  });
}

/** All gifts, ideas first. */
export function useGifts(q: Partial<GiftListQuery> = {}) {
  return useQuery({
    queryKey: giftKeys.list(q),
    queryFn: () => api.get<GiftListResult>(`/api/gifts${toQuery({ limit: 200, ...q })}`),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (gift: GiftOut | undefined, contactId: string) => {
    const id = gift?.contact.id ?? contactId;
    void qc.invalidateQueries({ queryKey: giftKeys.all });
    void qc.invalidateQueries({ queryKey: contactKeys.gifts(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
  };
}

export function useCreateGift(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: GiftCreateInput) => api.post<GiftOut>(`/api/contacts/${contactId}/gifts`, input),
    onSuccess: (gift) => invalidate(gift, contactId),
  });
}

export function useUpdateGift(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GiftUpdateInput }) => api.patch<GiftOut>(`/api/gifts/${id}`, input),
    onSuccess: (gift) => invalidate(gift, contactId),
  });
}

export function useGiveGift(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GiftGiveInput }) => api.post<GiftOut>(`/api/gifts/${id}/give`, input),
    onSuccess: (gift) => invalidate(gift, contactId),
  });
}

export function useRevertGift(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<GiftOut>(`/api/gifts/${id}/revert`),
    onSuccess: (gift) => invalidate(gift, contactId),
  });
}

export function useDeleteGift(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/gifts/${id}`),
    onSuccess: () => invalidate(undefined, contactId),
  });
}
