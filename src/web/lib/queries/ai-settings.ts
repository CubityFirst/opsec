import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiSettingsInput, AiSettingsOut, AiTestResult } from "@shared/schemas/ai-settings";
import { api } from "../api";

export const aiSettingsKey = ["ai", "settings"] as const;

/** Admin-only; pass `enabled: false` for other users so the 403 never fires. */
export function useAiSettings(enabled = true) {
  return useQuery({ queryKey: aiSettingsKey, queryFn: () => api.get<AiSettingsOut>("/api/ai/settings"), enabled, staleTime: 60_000 });
}

function useSettle() {
  const qc = useQueryClient();
  return (out: AiSettingsOut) => {
    qc.setQueryData(aiSettingsKey, out);
    void qc.invalidateQueries({ queryKey: ["ask", "config"] });
  };
}

export function useSaveAiSettings() {
  const settle = useSettle();
  return useMutation({ mutationFn: (input: AiSettingsInput) => api.put<AiSettingsOut>("/api/ai/settings", input), onSuccess: settle });
}

export function useResetAiSettings() {
  const settle = useSettle();
  return useMutation({ mutationFn: () => api.del<AiSettingsOut>("/api/ai/settings"), onSuccess: settle });
}

export function useTestAiSettings() {
  return useMutation({ mutationFn: (input: AiSettingsInput) => api.post<AiTestResult>("/api/ai/settings/test", input) });
}
