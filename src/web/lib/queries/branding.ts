import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_BRANDING, type Branding, type BrandingInput, type BrandingOut } from "@shared/schemas/branding";
import { api } from "../api";

export const brandingKey = ["branding"] as const;

/** Public: the sign-in page needs the name before there is a session. */
export function useBrandingSettings() {
  return useQuery({ queryKey: brandingKey, queryFn: () => api.get<BrandingOut>("/api/branding"), staleTime: 5 * 60_000 });
}

/** The active branding for anything that just wants to render the name; defaults until it loads. */
export function useBranding(): Branding {
  return useBrandingSettings().data?.branding ?? DEFAULT_BRANDING;
}

function useSettle() {
  const qc = useQueryClient();
  return (out: BrandingOut) => qc.setQueryData(brandingKey, out);
}

export function useSaveBranding() {
  const settle = useSettle();
  return useMutation({ mutationFn: (input: BrandingInput) => api.put<BrandingOut>("/api/branding", input), onSuccess: settle });
}

export function useResetBranding() {
  const settle = useSettle();
  return useMutation({ mutationFn: () => api.del<BrandingOut>("/api/branding"), onSuccess: settle });
}
