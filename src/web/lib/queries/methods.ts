import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContactMethodInput, ContactMethodUpdate } from "@shared/schemas/contact";
import type { ContactMethodOut } from "@shared/types";
import { api } from "../api";
import { contactKeys } from "./keys";

function useInvalidate(contactId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
    void qc.invalidateQueries({ queryKey: contactKeys.activity(contactId) });
  };
}

export function useAddMethod(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: (input: ContactMethodInput) => api.post<ContactMethodOut>(`/api/contacts/${contactId}/methods`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateMethod(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: ({ methodId, input }: { methodId: string; input: ContactMethodUpdate }) =>
      api.patch<ContactMethodOut>(`/api/contacts/${contactId}/methods/${methodId}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteMethod(contactId: string) {
  const invalidate = useInvalidate(contactId);
  return useMutation({
    mutationFn: (methodId: string) => api.del(`/api/contacts/${contactId}/methods/${methodId}`),
    onSuccess: invalidate,
  });
}
