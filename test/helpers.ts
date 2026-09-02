import { env, SELF } from "cloudflare:test";
import type { z } from "zod";
import type { contactCreateSchema } from "@shared/schemas/contact";
import type { ContactDetail, InteractionOut, RelationshipRowOut } from "@shared/types";
import { signSession, type SessionUser } from "../src/worker/lib/session";

/** Default test identity: an admin, so every route is exercisable. */
export const TEST_ADMIN: SessionUser = { sub: "test-admin", email: "admin@example.com", emailVerified: true, name: "Test Admin", picture: null, roles: ["admin"] };

const cookieCache = new Map<string, Promise<string>>();
async function sessionCookie(user: SessionUser): Promise<string> {
  const key = JSON.stringify(user);
  let p = cookieCache.get(key);
  if (!p) {
    p = signSession(user, env.SESSION_SECRET).then((t) => `opsec_session=${t}`);
    cookieCache.set(key, p);
  }
  return p;
}

type ApiInit = RequestInit & { anonymous?: boolean; as?: SessionUser };

export async function api(path: string, init?: ApiInit): Promise<Response> {
  const { anonymous, as, headers, ...rest } = init ?? {};
  const h = new Headers(headers);
  if (!anonymous && !h.has("cookie")) h.set("cookie", await sessionCookie(as ?? TEST_ADMIN));
  return SELF.fetch(`http://opsec.test${path}`, { ...rest, headers: h });
}

/** Call as a specific (non-default) identity. */
export function apiAs(user: Partial<SessionUser> & { sub: string }, path: string, init?: RequestInit): Promise<Response> {
  return api(path, { ...init, as: { email: null, emailVerified: false, name: null, picture: null, roles: [], ...user } });
}

export async function json<T = unknown>(path: string, init?: Omit<ApiInit, "body"> & { body?: unknown }): Promise<{ status: number; body: T }> {
  const { body, headers, ...rest } = init ?? {};
  const res = await api(path, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers as Record<string, string>) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export async function createContact(input: Partial<z.input<typeof contactCreateSchema>> & { firstName: string }): Promise<ContactDetail> {
  const { status, body } = await json<ContactDetail>("/api/contacts", { method: "POST", body: { kind: "person", ...input } });
  if (status !== 201) throw new Error(`createContact failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export async function createRelationship(fromContactId: string, toContactId: string, typeKey: string, extra: Record<string, unknown> = {}) {
  const { status, body } = await json<RelationshipRowOut>("/api/relationships", { method: "POST", body: { fromContactId, toContactId, typeKey, ...extra } });
  if (status !== 201) throw new Error(`createRelationship failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export async function createInteraction(contactIds: string[], extra: Record<string, unknown> = {}): Promise<InteractionOut> {
  const { status, body } = await json<InteractionOut>("/api/interactions", {
    method: "POST",
    body: { type: "call", occurredAt: new Date().toISOString(), summary: "Test call", contactIds, ...extra },
  });
  if (status !== 201) throw new Error(`createInteraction failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export function multipart(files: { name: string; content: string | Uint8Array; type: string; field?: string }[]): FormData {
  const fd = new FormData();
  for (const f of files) {
    fd.append(f.field ?? "file", new File([f.content], f.name, { type: f.type }));
  }
  return fd;
}
