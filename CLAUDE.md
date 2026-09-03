# opsec▮ — notes for coding agents

Personal CRM on a single Cloudflare Worker (Worker `opsec`, domain opsec.cubityfir.st; the repo folder and the D1/R2 resources keep the old name "nexus"). See README.md for the overview.

## Commands

- `npm run dev` — Vite + Worker in workerd, local D1/R2 under `.wrangler/state`
- `npm test` — API tests (vitest + `@cloudflare/vitest-pool-workers`, storage is shared within a test file, so never assume an empty database)
- `npm run typecheck` — all three TS projects (`tsconfig.app.json`, `tsconfig.worker.json`, `tsconfig.node.json`)
- `npm run build` — must pass before deploy; emits `dist/opsec/wrangler.json` that `npx wrangler deploy` uses. `wrangler.jsonc` top level is the generic open-access template (Deploy button, self-hosters); the author's instance is `env.prod` (custom domains, OIDC via Annex, AI Gateway): build it with `npm run build:prod` (sets `CLOUDFLARE_ENV=prod`) and ship with `npm run deploy:prod`, which also applies D1 migrations. Never deploy the top-level template to the `opsec` Worker: it would switch production to open access.
- `run_worker_first` is `true` in `wrangler.jsonc` so the legacy-host redirect (`nexus.cubityfir.st` → `opsec.cubityfir.st`, in `src/worker/index.ts`) applies to every path; the Worker serves static files through the ASSETS binding.
- Always call Wrangler as `npx wrangler`. Re-run `npm run types` after editing `wrangler.jsonc`.

## Conventions

- Inputs are validated with zod schemas in `src/shared/schemas`; response shapes are TypeScript types in `src/shared/types.ts`. The SPA imports both via `@shared/*`; the SPA itself is under `@/*` = `src/web`.
- Every multi-table write goes through `runBatch` (`src/worker/lib/batch.ts`) because D1 has no interactive transactions. Type statement arrays as `Stmt[]`.
- `services/activity.ts` is the only writer to the `activity` table. Add the `activityInsert(...)` statement to the same batch as the change it records. New event types go into the zod union in `src/shared/schemas/activity.ts` (add variants, never change existing payload shapes; bump `v` if you must).
- Relationship rows mean "from is the `type` of to". `GET /contacts/:id/relationships` returns each link with `typeLabel` = the OTHER contact's role relative to the viewed contact.
- IDs are ULIDs from `newId()`; timestamps are ISO-8601 UTC strings from `nowIso()`.
- Schema changes: edit `src/worker/db/schema.ts` → `npm run db:generate` → review SQL → `npm run db:migrate:local`. Seed rows and anything drizzle-kit cannot model go in a custom migration (`npx drizzle-kit generate --custom --name ...`).
- The `compatibility_date` in `wrangler.jsonc` must not exceed what the test pool's bundled workerd supports (currently 2026-08-22); raise it only after `npm test` still passes.
- Avatars: `src/web/components/contacts/AvatarCropDialog.tsx` (ported from cubedocs, animated GIF → animated WebP via `lib/webpMux.ts` + `gifuct-js`) produces the 512×512 crop; the upload sends both the crop (`file`) and the untouched original (`original`). `contacts.avatar_file_id` / `avatar_original_file_id` point at the two `files` rows.
- Social links are `contact_methods` rows with `type = "social"`, `label` = platform key and `value` = canonical profile URL. The registry (hosts, URL templates, icon names) is `src/shared/social.ts`; the API normalises on write (`socialFields` in `routes/contacts.ts`), and `SocialIcon.tsx` renders simple-icons paths (LinkedIn has no simple-icons glyph, so it gets a fallback).
- shadcn v4 has no `form` component; forms use `react-hook-form` + `@hookform/resolvers/zod` with `Label`/`Input` directly. Add components with `npx shadcn@latest add <name>`.

- Auth modes: `AUTH_MODE` var, `open` (default; `sessionMiddleware` sets the implicit admin `OPEN_USER`, sub `local`) or `oidc`. Tests run in `oidc` mode via the vitest bindings. `src/worker/routes/auth.ts` (openid-client v6, discovery-based, PKCE + state + nonce; id_token verified by the library), `lib/session.ts` (HS256 cookie via `hono/jwt`), `middleware/auth.ts` (`sessionMiddleware` → `requireAuth` on all `/api/*` except health, `/api/auth/*`, and `/api/dev/*` in development; `requireAdmin` gates destructive routes on `roles.includes("admin")`). Access policy `isAllowed()` in `lib/session.ts`: admins, or verified emails in the `ACCESS_ALLOWED_EMAILS` var; checked at callback and on every request. Server-to-Annex calls go through the `ANNEX` service binding (same-zone fetch would hit origin); see `services/oidc.ts`. Tests sign their own session cookie in `test/helpers.ts` (`api()` is admin by default, `apiAs()` for other roles, `anonymous: true` for none).

- **Ask** (`src/worker/services/ask/*`, `routes/ask.ts`): OpenAI Chat Completions via the `openai` SDK; provider is config only (`AI_*` vars/secrets, see README → Ask). Tools are read-only by construction (the tool test wraps `db` in a write-throwing proxy); writes happen only through proposals the user applies in the UI. The active provider is resolved per request by `services/ai-settings.ts` (`resolveProvider`): the admin-edited row in `app_settings` (secrets encrypted via `lib/crypto.ts` under `SESSION_SECRET`) wins over the `AI_*` vars. Keep secrets out of API responses (`providerView` reports presence only). Tests script the upstream with `ASK_FAKE_UPSTREAM=1` + `globalThis.__askFakeUpstream`; never call a real provider in tests.

- **MCP / API tokens**: `routes/mcp.ts` is a stateless Streamable HTTP MCP server (JSON-RPC over POST) authenticated only by API tokens (`services/tokens.ts`, `routes/tokens.ts`, table `api_tokens`, hashed). Read tools reuse the Ask read tools; write tools run the Ask proposal tools and apply the resulting request in-process via `app-ref.ts` (`internalFetch`) as the token's user, so all validation and logging stays in the normal routes. `sessionMiddleware` accepts bearer tokens for `/api/*` too; read-scoped tokens are refused for non-GET requests in `requireAuth`.

## Not yet done

- Multi-user data isolation: add `owner_id` columns and scope queries by `c.get("user").sub` if more than one person should have separate data.
- `/api/export`, relationship graph view, FTS5 search (LIKE is used today).
