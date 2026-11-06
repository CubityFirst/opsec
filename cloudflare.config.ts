import { bindings, defineConfig } from "cf/config";
import { readFileSync } from "node:fs";

// -----------------------------------------------------------------------------
// The default mode is the generic template used by "Deploy to Cloudflare" and by
// anyone self-hosting: a workers.dev URL, resources provisioned on first deploy,
// and OPEN ACCESS (AUTH_MODE "open"). Add your own authentication before
// exposing an instance to the internet; see README → Deploy your own.
//
// The author's own instance is the `prod` mode below (custom domains, OIDC via a
// private provider, AI Gateway). Build and deploy it with `--mode prod`
// (`npm run deploy:prod`). Without `--mode`, `cf dev` evaluates `development` and
// `cf build` / `cf deploy` evaluate `production`; both fall through to the
// template, so never deploy this Worker name without `--mode prod`.
//
// D1 migrations live in ./drizzle. cf keeps no migrations directory in the
// binding, so the package scripts pass `--dir drizzle` to `cf d1 migrations apply`.
//
// Local dev (`npm run dev`, mode `development`) persists to .cloudflare/state and
// differs from the template in two ways only, both invisible to a deploy:
//   - DB gets LOCAL_D1_ID, because `cf d1 migrations apply --local` needs an ID
//     and the template's database has none (`npm run db:migrate:local`).
//   - every key in .dev.vars becomes a local secret binding. The Vite plugin only
//     passes .dev.vars values to declared secrets, while Wrangler passed them all;
//     declaring them in the template itself would make them required on deploy.
//
// wrangler.jsonc is still in the repository for the tools that only read it: the
// Vitest pool (vitest.config.ts) and `npm run types` (worker-configuration.d.ts).
// Keep the two files in step when you change a binding or the compatibility date.
// -----------------------------------------------------------------------------

/** Settings shared by every mode. Bindings are not shared: each mode declares its own. */
const base = {
	name: "opsec",
	entrypoint: "src/worker/index.ts",
	// Must not exceed what the test pool's bundled workerd supports (see CLAUDE.md).
	compatibilityDate: "2026-08-22",
	compatibilityFlags: ["nodejs_compat"],
	observability: { enabled: true },
	assets: {
		notFoundHandling: "single-page-application" as const,
		// Every request hits the Worker first (host redirects, auth); the Worker then serves static files via ASSETS.
		runWorkerFirst: true,
	},
};

/** Local-only ID for the template's D1 under `cf dev`; never deployed. Keep in step with `db:migrate:local`. */
const LOCAL_D1_ID = "00000000-0000-4000-8000-00000000d1d1";

/** Names set in .dev.vars.development or .dev.vars (the first that exists, as the Vite plugin reads them). */
function devVarNames(): string[] {
	for (const file of [".dev.vars.development", ".dev.vars"]) {
		let text: string;
		try {
			// Relative to the working directory, like the Vite plugin's envDir (the project root).
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		return [...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1]!);
	}
	return [];
}

export default defineConfig((ctx) => {
	switch (ctx.mode) {
		case "prod": {
			return {
				worker: {
					...base,
					// Only the custom domains below: no workers.dev or preview hostnames for the author's instance.
					workersDev: false,
					previewUrls: false,
					domains: [
						"opsec.cubityfir.st",
						"opsec.nexus",
						// Former hostname: the Worker answers with a 308 to opsec.cubityfir.st (see src/worker/index.ts).
						"nexus.cubityfir.st",
					],
					env: {
						AUTH_MODE: bindings.text("oidc"),
						AUTH_PROVIDER_LABEL: bindings.text("Annex"),
						OIDC_ISSUER: bindings.text("https://auth.cubityfir.st"),
						OIDC_CLIENT_ID: bindings.text("annx_6d092a4c0a09224a32ab96d0"),
						ACCESS_ALLOWED_EMAILS: bindings.text("cubity@cubityfir.st"),
						TIMEZONE: bindings.text("Europe/London"),
						AI_BASE_URL: bindings.text("https://gateway.ai.cloudflare.com/v1/d843ae90cab33e54f4d284bc65d2fd6a/opsec/compat"),
						AI_MODEL: bindings.text("openai/gpt-5.6-luna"),
						AI_LABEL: bindings.text("gpt-5.6-luna via AI Gateway"),
						AI_EXTRA_BODY: bindings.text("{\"reasoning_effort\":\"none\"}"),
						// The resources keep the project's old name; Cloudflare cannot rename them.
						DB: bindings.d1({
							name: "nexus-db",
							id: "86818e80-503b-4c67-970a-39d6ca9ab6e0",
						}),
						BUCKET: bindings.r2({ name: "nexus-files" }),
						// Annex (auth.cubityfir.st) is a Worker on the same zone. A plain fetch from this Worker to a
						// same-zone hostname bypasses that hostname's Worker and hits the origin, so server-to-server
						// OIDC calls (token, JWKS, userinfo) go through this service binding. See services/oidc.ts.
						ANNEX: bindings.worker({ worker: "annex-auth" }),
						ASSETS: bindings.assets(),
					},
				},
			};
		}
		default: {
			const local = ctx.mode === "development";
			return {
				worker: {
					...base,
					workersDev: true,
					// No vars are required. Everything below is optional and defaults sensibly when unset:
					//   AUTH_MODE            "open" (default: no sign-in, every visitor is the owner) or "oidc"
					//   AUTH_PROVIDER_LABEL  name on the sign-in button (default "SSO")
					//   oidc mode            OIDC_ISSUER, OIDC_CLIENT_ID, ACCESS_ALLOWED_EMAILS (comma-separated verified
					//                        emails; accounts with the `admin` role are always allowed)
					//   Ask                  AI_BASE_URL, AI_MODEL, AI_LABEL, AI_EXTRA_BODY — or configure Ask from the
					//                        Account page after deploying (docs/ask.md). Put spend limits on the
					//                        provider / AI Gateway.
					//   TIMEZONE             IANA zone you live in (e.g. "Europe/London"); Ask uses the browser's zone
					//                        first, MCP clients only have this one. Unset = UTC.
					//   ENVIRONMENT          "development" only in local .dev.vars (opens the /api/dev/* seed routes)
					// Secrets (`npx wrangler secret put ...`): SESSION_SECRET (needed to encrypt stored provider keys,
					// and for oidc mode), OIDC_CLIENT_SECRET (oidc mode), AI_API_KEY, AI_EXTRA_HEADERS (optional).
					env: {
						...(local ? Object.fromEntries(devVarNames().map((name) => [name, bindings.secret()])) : {}),
						// No id on deploy: the database is provisioned on first deploy.
						DB: bindings.d1(local ? { name: "opsec-db", id: LOCAL_D1_ID } : { name: "opsec-db" }),
						BUCKET: bindings.r2({ name: "opsec-files" }),
						ASSETS: bindings.assets(),
					},
				},
			};
		}
	}
});
