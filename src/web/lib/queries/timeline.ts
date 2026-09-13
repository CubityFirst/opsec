import { useQuery } from "@tanstack/react-query";
import type { TimelineKind } from "@shared/schemas/timeline";
import type { TimelineResult } from "@shared/types";
import { api, toQuery } from "../api";

export const timelineKeys = { range: (from: string, to: string, kinds: TimelineKind[]) => ["timeline", from, to, kinds.join(",")] as const };

/** Everything that happened between two inclusive days (YYYY-MM-DD), across every contact. */
export function useTimeline(from: string, to: string, kinds: TimelineKind[]) {
  return useQuery({
    queryKey: timelineKeys.range(from, to, kinds),
    // An empty selection must not fall back to "everything" (that is what an omitted `kinds` means to the API).
    queryFn: () => api.get<TimelineResult>(`/api/timeline${toQuery({ from, to, kinds: kinds.length ? kinds.join(",") : "none" })}`),
    placeholderData: (prev) => prev,
  });
}
