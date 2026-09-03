import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiTokenCreateInput, ApiTokenCreated, ApiTokenOut } from "@shared/schemas/token";
import { api } from "../api";

export const tokenKeys = { all: ["tokens"] as const };

export function useTokens() {
  return useQuery({ queryKey: tokenKeys.all, queryFn: () => api.get<{ items: ApiTokenOut[] }>("/api/tokens"), select: (d) => d.items });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiTokenCreateInput) => api.post<ApiTokenCreated>("/api/tokens", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/tokens/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}
