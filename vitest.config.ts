import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import cloudflareConfig from "./cloudflare.config.ts";
import { FAKE_ISSUER, createFakeIdp } from "./test/fake-idp.ts";

/**
 * The Worker as cloudflare.config.ts declares it, in mode "test" (the template branch: no
 * custom domains, no IDP binding, no .dev.vars secrets). The pool cannot read that file itself,
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

/**
 * The service bindings mode "prod" declares (name -> target Worker). Tests get them as
 * TEST_PROD_SERVICE_BINDINGS so they can pin the binding name the code reads (`IDP`) to the
 * one the author's instance actually deploys: nothing else ties the two together.
 */
async function prodServiceBindings(): Promise<Record<string, string>> {
  const { worker } = await cloudflareConfig({ mode: "prod", isPreview: false });
  const out: Record<string, string> = {};
  for (const [name, binding] of Object.entries(worker.env)) {
    const b = binding as { type: string; worker?: string };
    if (b.type === "worker" && b.worker) out[name] = b.worker;
  }
  return out;
}

export default defineConfig(async () => {
  const { main, ...workerOptions } = await workerFromConfig();
  const migrations = await readD1Migrations(fileURLToPath(new URL("./drizzle", import.meta.url)));
  const oidcClient = { clientId: "test-client", clientSecret: "test-secret" };
  const fakeIdp = await createFakeIdp(oidcClient);
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
            SESSION_SECRET: "test-session-secret-at-least-32-characters",
            OIDC_ISSUER: FAKE_ISSUER,
            OIDC_CLIENT_ID: oidcClient.clientId,
            OIDC_CLIENT_SECRET: oidcClient.clientSecret,
            TEST_PROD_SERVICE_BINDINGS: await prodServiceBindings(),
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
            // Stands in for the identity provider Worker: discovery, JWKS and a token endpoint
            // issuing signed id_tokens (test/fake-idp.ts), so sign-in runs end to end.
            IDP: fakeIdp,
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
