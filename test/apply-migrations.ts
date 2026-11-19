import { applyD1Migrations, env } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
      /** Mode "prod" service bindings from cloudflare.config.ts, name -> target Worker (vitest.config.ts). */
      TEST_PROD_SERVICE_BINDINGS: Record<string, string>;
      // Set by vitest.config.ts. No mode of cloudflare.config.ts declares the secrets, so the generated Env lacks them.
      SESSION_SECRET: string;
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
