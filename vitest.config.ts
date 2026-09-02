import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./drizzle", import.meta.url)));
  return {
    resolve: {
      alias: {
        "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      },
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            SESSION_SECRET: "test-session-secret",
            OIDC_ISSUER: "https://auth.cubityfir.st",
            OIDC_CLIENT_ID: "test-client",
            OIDC_CLIENT_SECRET: "test-secret",
            ACCESS_ALLOWED_EMAILS: "allowed@example.com, Also.Allowed@Example.com",
            AI_BASE_URL: "https://ai.test/v1",
            AI_MODEL: "test-model",
            AI_LABEL: "test",
            AI_API_KEY: "none",
            AI_EXTRA_HEADERS: '{"x-test-header":"yes"}',
            AI_EXTRA_BODY: '{"parallel_tool_calls":true}',
            ASK_FAKE_UPSTREAM: "1",
            ASK_DAILY_REQUEST_LIMIT: "1000",
            ASK_DAILY_TOKEN_BUDGET: "50000000",
          },
          // The real Annex Worker is not available in tests; nothing here performs a login.
          serviceBindings: { ANNEX: async () => new Response("annex unavailable in tests", { status: 503 }) },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
