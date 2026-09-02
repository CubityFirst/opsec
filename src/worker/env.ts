import type { Db } from "./db";
import type { SessionUser } from "./lib/session";

/**
 * Vars and secrets the Worker reads. All optional: a fresh "Deploy to Cloudflare"
 * install sets only the few in the top level of wrangler.jsonc, and the code treats
 * anything missing as unset. Merged into the generated `Env` so typing does not
 * depend on which vars a particular machine's config or .dev.vars declare.
 */
export interface AppVars {
  ENVIRONMENT?: string;
  AUTH_MODE?: string;
  AUTH_PROVIDER_LABEL?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  ACCESS_ALLOWED_EMAILS?: string;
  SESSION_SECRET?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_LABEL?: string;
  AI_EXTRA_BODY?: string;
  AI_API_KEY?: string;
  AI_EXTRA_HEADERS?: string;
  ASK_DAILY_REQUEST_LIMIT?: string;
  ASK_DAILY_TOKEN_BUDGET?: string;
  /** Test hook: route provider calls to globalThis.__askFakeUpstream. */
  ASK_FAKE_UPSTREAM?: string;
}

export type WorkerEnv = Env & AppVars;

export type AppEnv = {
  Bindings: WorkerEnv;
  Variables: {
    db: Db;
    /** Verified session, or null when the request carries no valid cookie. */
    user: SessionUser | null;
    /** Identity recorded in the activity log: the OIDC `sub`, or "anonymous". */
    actor: string;
  };
};
