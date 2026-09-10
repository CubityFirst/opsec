import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarFeedCreateInput, CalendarFeedOut, CalendarFeedUpdateInput } from "@shared/schemas/calendar";
import { api } from "../api";

export const calendarFeedKeys = { all: ["calendar-feeds"] as const };

export function useCalendarFeeds() {
  return useQuery({ queryKey: calendarFeedKeys.all, queryFn: () => api.get<{ items: CalendarFeedOut[] }>("/api/calendar-feeds"), select: (d) => d.items });
}

export function useCreateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarFeedCreateInput) => api.post<CalendarFeedOut>("/api/calendar-feeds", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: calendarFeedKeys.all }),
  });
}

export function useUpdateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: CalendarFeedUpdateInput & { id: string }) => api.patch<CalendarFeedOut>(`/api/calendar-feeds/${id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: calendarFeedKeys.all }),
  });
}

export function useRotateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<CalendarFeedOut>(`/api/calendar-feeds/${id}/rotate`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: calendarFeedKeys.all }),
  });
}

export function useDeleteCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/calendar-feeds/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: calendarFeedKeys.all }),
  });
}

/** Subscription URLs for a feed: plain https for Google Calendar and downloads, webcal:// for Apple Calendar and Outlook. */
export function feedUrls(key: string): { https: string; webcal: string } {
  const https = `${window.location.origin}/calendar/${key}.ics`;
  return { https, webcal: https.replace(/^https?:/, "webcal:") };
}
