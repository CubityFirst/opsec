import { z } from "zod";
import { nonBlank } from "./common";

export const API_TOKEN_SCOPES = ["read", "write"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Every token starts with this so it is recognisable in logs and config files. */
export const API_TOKEN_PREFIX = "opsec_";

export const apiTokenCreateSchema = z.object({
  name: nonBlank(60),
  scope: z.enum(API_TOKEN_SCOPES),
});
export type ApiTokenCreateInput = z.infer<typeof apiTokenCreateSchema>;

export interface ApiTokenOut {
  id: string;
  name: string;
  scope: ApiTokenScope;
  /** First characters of the token, for telling them apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Returned once, at creation: the full token is never stored or shown again. */
export interface ApiTokenCreated extends ApiTokenOut {
  token: string;
}
