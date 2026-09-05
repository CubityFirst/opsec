import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReminderCreateInput, ReminderListQuery, ReminderUpdateInput } from "@shared/schemas/reminder";
import type { ReminderListResult, ReminderOut } from "@shared/types";
import { api, toQuery } from "../api";
import { contactKeys, reminderKeys } from "./keys";

export function useContactReminders(contactId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.reminders(contactId ?? ""),
    queryFn: () => api.get<ReminderListResult>(`/api/contacts/${contactId}/reminders?limit=200`),
    enabled: !!contactId,
  });
}

/** All reminders, open first. `dueBy` narrows to open reminders due on or before that day. */
export function useReminders(q: Partial<ReminderListQuery> = {}) {
  return useQuery({
    queryKey: reminderKeys.list(q),
    queryFn: () => api.get<ReminderListResult>(`/api/reminders${toQuery({ limit: 200, ...q })}`),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...contactIds: (string | null | undefined)[]) => {
    void qc.invalidateQueries({ queryKey: reminderKeys.all });
    for (const id of new Set(contactIds.filter((x): x is string => !!x))) {
      void qc.invalidateQueries({ queryKey: contactKeys.reminders(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
    }
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
  };
}

export function useCreateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ReminderCreateInput) => api.post<ReminderOut>("/api/reminders", input),
    onSuccess: (r) => invalidate(r.contact?.id),
  });
}

export function useUpdateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReminderUpdateInput }) => api.patch<ReminderOut>(`/api/reminders/${id}`, input),
    onSuccess: (r, vars) => invalidate(r.contact?.id, vars.input.contactId),
  });
}

function useAction(action: "complete" | "skip" | "reopen") {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (reminder: ReminderOut) => api.post<ReminderOut>(`/api/reminders/${reminder.id}/${action}`),
    onSuccess: (r) => invalidate(r.contact?.id),
  });
}

export const useCompleteReminder = () => useAction("complete");
export const useSkipReminder = () => useAction("skip");
export const useReopenReminder = () => useAction("reopen");

export function useDeleteReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (reminder: ReminderOut) => api.del(`/api/reminders/${reminder.id}`),
    onSuccess: (_, reminder) => invalidate(reminder.contact?.id),
  });
}
