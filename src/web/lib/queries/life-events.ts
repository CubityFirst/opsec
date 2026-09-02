import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LifeEventCreateInput, LifeEventUpdateInput } from "@shared/schemas/life-event";
import type { LifeEventOut, ListResult } from "@shared/types";
import { api } from "../api";
import { contactKeys } from "./keys";

export function useLifeEvents(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.lifeEvents(contactId ?? ""),
    queryFn: () => api.get<ListResult<LifeEventOut>>(`/api/contacts/${contactId}/life-events`),
    enabled: !!contactId,
  });
}

function useInvalidate(contactId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: contactKeys.lifeEvents(contactId) });
    void qc.invalidateQueries({ queryKey: contactKeys.activity(contactId) });
    void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
  };
}

export function useCreateLifeEvent(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: (input: LifeEventCreateInput) => api.post<LifeEventOut>(`/api/contacts/${contactId}/life-events`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLifeEvent(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LifeEventUpdateInput }) => api.patch<LifeEventOut>(`/api/life-events/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLifeEvent(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/life-events/${id}`),
    onSuccess: invalidate,
  });
}
