import { applyD1Migrations, env } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
      // Set by vitest.config.ts. No mode of cloudflare.config.ts declares the secrets, so the generated Env lacks them.
      SESSION_SECRET: string;
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
