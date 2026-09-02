import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TagCreateInput, TagUpdateInput } from "@shared/schemas/tag";
import type { TagOut, TagWithCount } from "@shared/types";
import { api } from "../api";
import { contactKeys, tagKeys } from "./keys";

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: () => api.get<{ items: TagWithCount[] }>("/api/tags"),
  });
}

function useInvalidateTags() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: tagKeys.all });
    void qc.invalidateQueries({ queryKey: contactKeys.all });
  };
}

export function useCreateTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (input: TagCreateInput) => api.post<TagOut>("/api/tags", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TagUpdateInput }) => api.patch<TagOut>(`/api/tags/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/tags/${id}`),
    onSuccess: invalidate,
  });
}
