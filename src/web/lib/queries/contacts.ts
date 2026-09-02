import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactBulkInput, ContactCreateInput, ContactListQuery, ContactUpdateInput } from "@shared/schemas/contact";
import type { ContactDetail, ContactSummary, FileOut, ListResult } from "@shared/types";
import { api, toQuery } from "../api";
import { contactKeys, tagKeys } from "./keys";

export function useContacts(query: Partial<ContactListQuery>) {
  return useQuery({
    queryKey: contactKeys.list(query),
    queryFn: () => api.get<ListResult<ContactSummary>>(`/api/contacts${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: contactKeys.detail(id ?? ""),
    queryFn: () => api.get<ContactDetail>(`/api/contacts/${id}`),
    enabled: !!id,
  });
}

function useInvalidateContact() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: contactKeys.lists() });
    void qc.invalidateQueries({ queryKey: tagKeys.all });
    if (id) {
      void qc.invalidateQueries({ queryKey: contactKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.activity(id) });
    }
  };
}

export function useBulkContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactBulkInput) => api.post<{ updated: number }>("/api/contacts/bulk", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.all });
      void qc.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useCreateContact() {
  const invalidate = useInvalidateContact();
  return useMutation({
    mutationFn: (input: ContactCreateInput) => api.post<ContactDetail>("/api/contacts", input),
    onSuccess: (c) => invalidate(c.id),
  });
}

export function useUpdateContact(id: string) {
  const invalidate = useInvalidateContact();
  return useMutation({
    mutationFn: (input: ContactUpdateInput) => api.patch<ContactDetail>(`/api/contacts/${id}`, input),
    onSuccess: () => invalidate(id),
  });
}

export function useArchiveContact(id: string) {
  const invalidate = useInvalidateContact();
  return useMutation({
    mutationFn: (archive: boolean) => api.post<ContactDetail>(`/api/contacts/${id}/${archive ? "archive" : "unarchive"}`),
    onSuccess: () => invalidate(id),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/contacts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.all });
      void qc.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useSetContactTags(id: string) {
  const invalidate = useInvalidateContact();
  return useMutation({
    mutationFn: (tagNames: string[]) => api.put<ContactDetail>(`/api/contacts/${id}/tags`, { tagNames }),
    onSuccess: () => invalidate(id),
  });
}

export function useUploadAvatar(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateContact();
  return useMutation({
    /** `cropped` is what is displayed; `original` is kept so the full photo can be viewed. */
    mutationFn: ({ cropped, original }: { cropped: Blob; original?: File }) => {
      const form = new FormData();
      form.append("file", cropped, "avatar.webp");
      if (original) form.append("original", original, original.name);
      return api.upload<FileOut>(`/api/contacts/${id}/avatar`, form);
    },
    onSuccess: () => {
      invalidate(id);
      void qc.invalidateQueries({ queryKey: contactKeys.files(id) });
    },
  });
}

export function useDeleteAvatar(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateContact();
  return useMutation({
    mutationFn: () => api.del(`/api/contacts/${id}/avatar`),
    onSuccess: () => {
      invalidate(id);
      void qc.invalidateQueries({ queryKey: contactKeys.files(id) });
    },
  });
}
