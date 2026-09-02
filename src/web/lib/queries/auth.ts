import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserPreferencesUpdate } from "@shared/schemas/preferences";
import type { AuthUser } from "@shared/types";
import { ApiError, api } from "../api";

export const authKeys = { me: ["auth", "me"] as const };

/** The signed-in user, or null when there is no valid session. */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await api.get<AuthUser>("/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Convenience for components that render only when signed in. */
export function useAuthUser(): AuthUser | null {
  return useMe().data ?? null;
}

export function signInUrl(next = window.location.pathname + window.location.search): string {
  return `/api/auth/login?next=${encodeURIComponent(next)}`;
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserPreferencesUpdate) => api.patch<AuthUser>("/api/auth/preferences", patch),
    onSuccess: (user) => qc.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; logoutUrl: string | null }>("/api/auth/logout"),
    onSuccess: (r) => {
      qc.clear();
      window.location.assign(r.logoutUrl ?? "/");
    },
  });
}
