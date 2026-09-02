import type { Db } from "./db";
import type { SessionUser } from "./lib/session";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    /** Verified session, or null when the request carries no valid cookie. */
    user: SessionUser | null;
    /** Identity recorded in the activity log: the OIDC `sub`, or "anonymous". */
    actor: string;
  };
};
