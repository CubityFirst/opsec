import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import cloudflareConfig from "./cloudflare.config.ts";

/**
 * The Worker as cloudflare.config.ts declares it, in mode "test" (the template branch: no
 * custom domains, no Annex, no .dev.vars secrets). The pool cannot read that file itself,
 * so its entrypoint, compatibility settings and storage bindings are passed on here;
 * vars, secrets and the two service bindings come from `miniflare` below.
 */
async function workerFromConfig() {
  const { worker } = await cloudflareConfig({ mode: "test", isPreview: false });
  const d1Databases: Record<string, string> = {};
  const r2Buckets: Record<string, string> = {};
  for (const [name, binding] of Object.entries(worker.env)) {
    switch (binding.type) {
      case "d1":
        d1Databases[name] = binding.name ?? name;
        break;
      case "r2":
        r2Buckets[name] = binding.name ?? name;
        break;
      case "assets":
        break; // replaced by the ASSETS service binding below
      default:
        throw new Error(`vitest.config.ts: binding ${name} (${binding.type}) needs a test equivalent`);
    }
  }
  return {
    main: worker.entrypoint,
    compatibilityDate: worker.compatibilityDate,
    compatibilityFlags: [...worker.compatibilityFlags],
    d1Databases,
    r2Buckets,
  };
}

export default defineConfig(async () => {
  const { main, ...workerOptions } = await workerFromConfig();
  const migrations = await readD1Migrations(fileURLToPath(new URL("./drizzle", import.meta.url)));
  const manifest = await readFile(fileURLToPath(new URL("./public/manifest.webmanifest", import.meta.url)), "utf8");
  return {
    resolve: {
      alias: {
        "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      },
    },
    plugins: [
      cloudflareTest({
        main,
        miniflare: {
          ...workerOptions,
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            SESSION_SECRET: "test-session-secret",
            OIDC_ISSUER: "https://auth.cubityfir.st",
            OIDC_CLIENT_ID: "test-client",
            OIDC_CLIENT_SECRET: "test-secret",
            AUTH_MODE: "oidc",
            AUTH_PROVIDER_LABEL: "Test IdP",
            ACCESS_ALLOWED_EMAILS: "allowed@example.com, Also.Allowed@Example.com",
            AI_BASE_URL: "https://ai.test/v1",
            AI_MODEL: "test-model",
            AI_LABEL: "test",
            AI_API_KEY: "none",
            AI_EXTRA_HEADERS: '{"x-test-header":"yes"}',
            AI_EXTRA_BODY: '{"parallel_tool_calls":true}',
            ASK_FAKE_UPSTREAM: "1",
            GEOCODE_FAKE_UPSTREAM: "1",
          },
          serviceBindings: {
            // The real Annex Worker is not available in tests; nothing here performs a login.
            ANNEX: async () => new Response("annex unavailable in tests", { status: 503 }),
            // There is no built client in tests: serve the one asset the Worker reads
            // (the PWA manifest it rebrands) and 404 the rest, as the catch-all would.
            ASSETS: async (req: Request) =>
              new URL(req.url).pathname === "/manifest.webmanifest"
                ? new Response(manifest, { headers: { "content-type": "application/manifest+json" } })
                : new Response("not found", { status: 404 }),
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
