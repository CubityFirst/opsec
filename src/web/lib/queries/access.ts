import { useQuery } from "@tanstack/react-query";

export const accessKeys = { identity: ["cf-access", "identity"] as const };

/** Who Cloudflare Access says the visitor is, when the app sits behind it. */
export type AccessIdentity = { email: string | null; name: string | null; idp: string | null };

type IdentityBody = {
  email?: unknown;
  name?: unknown;
  user_uuid?: unknown;
  common_name?: unknown;
  idp?: { type?: unknown } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Probes `/cdn-cgi/access/get-identity`, which Cloudflare only serves on hostnames
 * covered by an Access application, so a JSON identity back means a login happened in
 * front of the Worker. This is a UI hint only — nothing is authorised by it, so the
 * JWT is not verified here. The SPA fallback answers unknown paths with index.html, so
 * an HTML (or unparseable) response counts as "no Access".
 */
async function fetchAccessIdentity(): Promise<AccessIdentity | null> {
  let res: Response;
  try {
    res = await fetch("/cdn-cgi/access/get-identity", { headers: { accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
  let body: IdentityBody | null = null;
  try {
    body = (await res.json()) as IdentityBody;
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const who = str(body.email) ?? str(body.user_uuid) ?? str(body.common_name);
  if (!who) return null;
  return { email: str(body.email), name: str(body.name), idp: str(body.idp?.type) };
}

/** `data` is the Access identity, or null when the app is not behind Access. */
export function useAccessIdentity(enabled = true) {
  return useQuery({ queryKey: accessKeys.identity, queryFn: fetchAccessIdentity, enabled, retry: false, staleTime: Infinity });
}
