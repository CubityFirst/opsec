import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileOut } from "@shared/types";
import { api } from "../api";
import { contactKeys } from "./keys";

export function useContactFiles(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.files(contactId ?? ""),
    queryFn: () => api.get<{ items: FileOut[] }>(`/api/contacts/${contactId}/files`),
    enabled: !!contactId,
  });
}

export function useDeleteFile(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api.del(`/api/files/${fileId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.files(contactId) });
      void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
      void qc.invalidateQueries({ queryKey: contactKeys.activity(contactId) });
      void qc.invalidateQueries({ queryKey: contactKeys.interactions(contactId) });
      void qc.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}
