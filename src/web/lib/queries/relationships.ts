import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RelationshipCreateInput, RelationshipUpdateInput } from "@shared/schemas/relationship";
import type { RelationshipOut, RelationshipRowOut, RelationshipTypeOut } from "@shared/types";
import { api } from "../api";
import { contactKeys, relationshipTypeKeys } from "./keys";

export function useRelationships(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.relationships(contactId ?? ""),
    queryFn: () => api.get<{ items: RelationshipOut[] }>(`/api/contacts/${contactId}/relationships`),
    enabled: !!contactId,
  });
}

export function useRelationshipTypes() {
  return useQuery({
    queryKey: relationshipTypeKeys.all,
    queryFn: () => api.get<{ items: RelationshipTypeOut[] }>("/api/relationship-types"),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateBoth() {
  const qc = useQueryClient();
  return (ids: string[]) => {
    for (const id of ids) {
      void qc.invalidateQueries({ queryKey: contactKeys.relationships(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
    }
  };
}

export function useCreateRelationship() {
  const invalidate = useInvalidateBoth();
  return useMutation({
    mutationFn: (input: RelationshipCreateInput) => api.post<RelationshipRowOut>("/api/relationships", input),
    onSuccess: (row) => invalidate([row.fromContactId, row.toContactId]),
  });
}

export function useUpdateRelationship(contactIds: string[]) {
  const invalidate = useInvalidateBoth();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RelationshipUpdateInput }) =>
      api.patch<RelationshipRowOut>(`/api/relationships/${id}`, input),
    onSuccess: () => invalidate(contactIds),
  });
}

export function useDeleteRelationship(contactIds: string[]) {
  const invalidate = useInvalidateBoth();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/relationships/${id}`),
    onSuccess: () => invalidate(contactIds),
  });
}
