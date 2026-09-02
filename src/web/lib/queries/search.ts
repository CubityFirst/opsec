import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@shared/types";
import { api, toQuery } from "../api";
import { searchKeys } from "./keys";

export function useSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: searchKeys.query(trimmed),
    queryFn: () => api.get<SearchResult>(`/api/search${toQuery({ q: trimmed })}`),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
