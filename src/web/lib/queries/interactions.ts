import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InteractionCreateInput, InteractionUpdateInput } from "@shared/schemas/interaction";
import type { FeedResult, FileOut, InteractionOut, ListResult } from "@shared/types";
import { api, toQuery } from "../api";
import { contactKeys, interactionKeys } from "./keys";

export function useContactInteractions(contactId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: [...contactKeys.interactions(contactId ?? ""), limit],
    queryFn: () => api.get<ListResult<InteractionOut>>(`/api/contacts/${contactId}/interactions${toQuery({ limit })}`),
    enabled: !!contactId,
  });
}

export function useActivityFeed(contactId: string | undefined, limit = 50) {
  return useInfiniteQuery({
    queryKey: [...contactKeys.activity(contactId ?? ""), limit],
    queryFn: ({ pageParam }) =>
      api.get<FeedResult>(`/api/contacts/${contactId}/activity${toQuery({ limit, before: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!contactId,
  });
}

/** Newest interactions across every contact, paged by offset. */
export function useRecentInteractions(limit = 20) {
  return useInfiniteQuery({
    queryKey: interactionKeys.recent(limit),
    queryFn: ({ pageParam }) => api.get<ListResult<InteractionOut>>(`/api/interactions${toQuery({ limit, offset: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

export function useInteraction(id: string | undefined) {
  return useQuery({
    queryKey: interactionKeys.detail(id ?? ""),
    queryFn: () => api.get<InteractionOut>(`/api/interactions/${id}`),
    enabled: !!id,
  });
}

function useInvalidateParticipants() {
  const qc = useQueryClient();
  return (ids: string[]) => {
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
    void qc.invalidateQueries({ queryKey: interactionKeys.all });
    for (const id of ids) {
      void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.interactions(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.files(id) });
    }
  };
}

export function useCreateInteraction() {
  const invalidate = useInvalidateParticipants();
  return useMutation({
    mutationFn: (input: InteractionCreateInput) => api.post<InteractionOut>("/api/interactions", input),
    onSuccess: (i) => invalidate(i.participants.map((p) => p.id)),
  });
}

export function useUpdateInteraction(previousParticipantIds: string[]) {
  const invalidate = useInvalidateParticipants();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InteractionUpdateInput }) =>
      api.patch<InteractionOut>(`/api/interactions/${id}`, input),
    onSuccess: (i) => invalidate([...new Set([...previousParticipantIds, ...i.participants.map((p) => p.id)])]),
  });
}

export function useDeleteInteraction(participantIds: string[]) {
  const invalidate = useInvalidateParticipants();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/interactions/${id}`),
    onSuccess: () => invalidate(participantIds),
  });
}

export function useUploadAttachments(participantIds: string[]) {
  const invalidate = useInvalidateParticipants();
  return useMutation({
    mutationFn: ({ interactionId, files }: { interactionId: string; files: File[] }) => {
      const form = new FormData();
      for (const f of files) form.append("file", f);
      return api.upload<{ items: FileOut[] }>(`/api/interactions/${interactionId}/files`, form);
    },
    onSuccess: () => invalidate(participantIds),
  });
}
