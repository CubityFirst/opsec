<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/opsec-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/brand/opsec-light.svg">
    <img alt="opsec" src="docs/brand/opsec-light.svg" width="320">
  </picture>
</p>

<p align="center"><strong>A personal CRM for the people, pets and organisations in your life.</strong><br>
One Cloudflare Worker, one SQLite database, no third party holding your contacts.</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/CubityFirst/opsec"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>
</p>

---

## What it is

opsec▮ keeps everyone you know in one graph. A contact can be a person, a pet or an organisation, and any contact can be related to any other: Rex is Alice's dog, Acme Ltd is Sam's employer, Jo is a member of the Hill family. Around each contact sits everything you would otherwise keep in your head: how you met and who introduced you, phone numbers, emails, addresses and social profiles, tags, notes, custom fields, photos, life events, and a chronological feed of every interaction with attachments. "When did we last speak, and about what" is always one click away.

It runs as a single Cloudflare Worker at [opsec.cubityfir.st](https://opsec.cubityfir.st) with D1 for data and R2 for files, signs you in through your own OpenID Connect provider, and costs pennies a month.

## Highlights

- **One graph, three kinds.** People, pets and organisations share the same contact model. Relationships are typed and directional ("X is the *parent* of Y") with the other side derived automatically, grouped into family, social, group, work, pet and care.
- **Interactions with context.** Calls, texts, meals, meetings, gifts and notes, each with participants, a markdown body, a location and file attachments. `@mentions` link to contacts and `#tags` link to lists, in summaries as well as bodies. Clicking a mention opens a mini profile card.
- **Life and work.** First-class job title and employer that keep the employer relationship in step; life events in five categories; a "how we met" record with a date, place and the person who introduced you; partial dates everywhere (a birthday without a year, a month without a day).
- **Names as people use them.** Nickname, pronouns and any number of other names (a Chinese name, a maiden name), all searchable.
- **Ask.** A chat over your own data: "When did I last talk to Alice about Lisbon?", "Who introduced me to Rex's vet?", or paste a screenshot and say "log this". The model investigates with read-only tools and can propose any change, from logging an interaction to creating an organisation and setting someone's job there in one go. Nothing is written until you press Apply. It speaks the OpenAI chat-completions format, so the provider is configuration: Cloudflare AI Gateway, OpenAI, Anthropic, OpenRouter or a llama.cpp box at home, switchable from the Account page.
- **Yours.** Sign-in through Annex (OpenID Connect with PKCE), access limited to an allow-list, secrets encrypted at rest, a per-user daily spend guard on the model, and no analytics or third-party scripts.

## Stack

- **Runtime**: one Cloudflare Worker (Hono JSON API) serving a React SPA as static assets
- **Data**: D1 (SQLite) via Drizzle ORM, migrations applied with Wrangler
- **Files**: R2 for avatars and interaction attachments, streamed through the Worker
- **UI**: React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query, react-router
- **Auth**: "Sign in with Annex" (OpenID Connect, Authorization Code + PKCE) via openid-client; sessions are signed cookies keyed on the `sub` claim; admin features are gated on the `roles` claim
- **Ask**: the `openai` SDK against any OpenAI-compatible endpoint, streamed to the browser over server-sent events

## Deploy your own

The **Deploy to Cloudflare** button above forks this repository into your GitHub account and creates the Worker, a D1 database and an R2 bucket from `wrangler.jsonc`, then builds and deploys it. The deploy step runs the D1 migrations first (`npm run deploy`), so the instance is ready at its `workers.dev` URL when the build finishes. The button only asks about the handful of vars the template sets (`AUTH_MODE` and the provider label); everything else is optional and can be added later in the dashboard or with Wrangler.

> **A fresh install has no authentication.** `AUTH_MODE` defaults to `open`: there is no sign-in and every visitor is treated as the owner with admin rights. That is deliberate, because everyone's identity provider is different, but it means an open instance on a public URL is an open address book. Before you put anything real in it, do one of the following.

1. **Put your own gate in front.** The simplest is [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) on the Worker's hostname: one policy, any login method, no code changes. Anything that blocks unauthenticated requests before they reach the Worker works.
2. **Turn on the built-in OpenID Connect sign-in.** Set the vars `AUTH_MODE=oidc`, `OIDC_ISSUER` (the provider's issuer URL, discovery is used), `OIDC_CLIENT_ID`, `AUTH_PROVIDER_LABEL` (the name on the sign-in button) and `ACCESS_ALLOWED_EMAILS`, then the secrets `OIDC_CLIENT_SECRET` and `SESSION_SECRET`. Register `https://<your host>/api/auth/callback` as the redirect URI. Any provider that supports Authorization Code + PKCE and a `roles` claim (for admin gating) works; see [Authentication](#authentication).

After deploying:

- Open **Account → Ask provider** to point Ask at a model provider (the deployment ships with none). Storing an API key there needs the `SESSION_SECRET` secret; a key-less provider such as an AI Gateway with BYOK or a local llama.cpp does not.
- Optional secrets, set with `npx wrangler secret put <NAME>`: `SESSION_SECRET` (sessions and encryption of stored provider keys), `AI_API_KEY`, `AI_EXTRA_HEADERS`.

To deploy from your own machine instead of the button: clone, `npm install`, `npx wrangler login`, then `npm run deploy`. Wrangler provisions the D1 database and R2 bucket named in `wrangler.jsonc` on the first deploy.

## Getting started

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in OIDC_CLIENT_SECRET and a random SESSION_SECRET
npm run db:migrate:local         # apply migrations to the local D1
npm run dev                      # Vite + Worker (local D1/R2 under .wrangler/state)
npm run seed                     # optional sample data (dev only)
```

Open http://localhost:5173 and sign in with Annex. For local sign-in the redirect URI
`http://localhost:5173/api/auth/callback` must be registered with the Annex client.

## Authentication

Two modes, chosen by the `AUTH_MODE` var:

- **`open`** (default): no sign-in. Every request runs as a single implicit owner (`sub` = `local`, admin). Use it behind your own gate, or for local development.
- **`oidc`**: "Sign in with <provider>" using OpenID Connect (Authorization Code + PKCE, `state` and `nonce`, discovery from `OIDC_ISSUER`) via openid-client. Sessions are HS256-signed cookies keyed on the `sub` claim, never on email. Access is limited to accounts with the `admin` role plus verified emails listed in `ACCESS_ALLOWED_EMAILS`; the policy is checked at sign-in and on every request, so revoking someone locks existing cookies out immediately. Destructive routes additionally require the `admin` role. Scopes: `openid profile email roles`.

Config for `oidc` mode: vars `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `AUTH_PROVIDER_LABEL`, `ACCESS_ALLOWED_EMAILS`; secrets `OIDC_CLIENT_SECRET`, `SESSION_SECRET`. Redirect URI: `https://<host>/api/auth/callback`.

The author's instance (`env.prod` in `wrangler.jsonc`) signs in through Annex, a private provider on the same Cloudflare zone. Because a Worker's fetch to a same-zone hostname skips that hostname's Worker, its token, JWKS and userinfo calls go through a service binding; that binding is optional and only used when present.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with the Worker running in workerd |
| `npm run build` | Typecheck (`tsc -b`) and build client + Worker into `dist/` |
| `npm run deploy` | Build, then `npx wrangler deploy` |
| `npm run db:generate` | Generate a SQL migration from `src/worker/db/schema.ts` |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply migrations to local / production D1 |
| `npm run seed` | POST `/api/dev/seed` against the local dev server |
| `npm test` | API tests in workerd against an isolated D1 + R2 |
| `npm run typecheck` | Typecheck all projects |
| `npm run types` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |

Wrangler is always invoked as `npx wrangler`.

## Project layout

```
src/shared/     zod input schemas + response types shared by API and UI
src/worker/     Hono app: db/ (Drizzle schema), routes/, services/, lib/
src/web/        React SPA (shadcn components in components/ui)
drizzle/        SQL migrations (drizzle-kit output; wrangler migrations_dir)
test/           vitest + @cloudflare/vitest-pool-workers API tests
```

## Data model

Text ULID primary keys, ISO-8601 UTC timestamps.

| Table | Purpose |
|---|---|
| `contacts` | kind = person / pet / organization, names (plus `other_names` JSON: Chinese name, English name, maiden name…), how we met (`met_on` partial date, `met_where`, `met_how`, `met_via_contact_id`), work (`job_title`, `employer_contact_id` → an organisation; setting it maintains the employer ↔ employee relationship), birthday / founded (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `--MM-DD` or `--MM`, whichever parts are known), notes, custom_fields JSON, archived_at |
| `contact_methods` | phone / email / address / social / url / other, with label and is_primary. For `social`, the label is a platform key and the value the canonical profile URL (see `src/shared/social.ts`; icons from simple-icons) |
| `tags`, `contact_tags` | case-insensitive tags |
| `relationship_types` | seeded lookup with `inverse_key` (parent ↔ child, owner ↔ pet, …) and `from_kinds` / `to_kinds` saying which contact kinds each end may be (an organisation can be an employer or a supplier, not a parent) |
| `relationships` | one directed row per link: "from is the `type` of to" |
| `interactions`, `interaction_contacts` | call / text / meal / … with one or more participants |
| `life_events` | milestones per contact in five categories (work & education, family & relationships, home & living, health & wellness, travel & experiences) with a partial date; shown in the feed at that date |
| `files` | R2 object metadata: `avatar` (cropped 512×512 WebP), `avatar_original` (the untouched upload, viewable full-size), `attachment` |
| `activity` | append-only event log per contact with versioned JSON payloads |

Interaction details and notes are markdown. `[@Name](/contacts/<id>)` mentions a contact
(the editor inserts these when you type `@`), and `#tag` links to the contacts list filtered
by that tag. Mentioning a contact who is not a participant adds an `interaction.mentioned`
entry to their activity feed.

The activity log is written in the same D1 batch as the change it describes, so it
never drifts from the data. Payload shapes are the zod union in
`src/shared/schemas/activity.ts`; `GET /api/activity?since=<ulid>` streams the log
for programmatic consumers.

Relationship rows are stored once. Reading a contact's relationships returns each
link from that contact's perspective: `typeLabel` is the *other* contact's role
(on Alice's page Rex reads "Pet"; on Rex's page Alice reads "Owner").

## API

All routes are under `/api`, JSON in and out. Lists return `{ items, total }`;
errors return `{ error: { code, message, issues? } }`.

- `GET/POST /contacts`, `GET/PATCH/DELETE /contacts/:id`, `POST /contacts/:id/archive|unarchive`, `PUT /contacts/:id/tags`, `POST /contacts/bulk` (`{ ids, action: addTags|removeTags|archive|unarchive|delete, tagNames? }`)
- `GET/POST /contacts/:id/methods`, `PATCH/DELETE /contacts/:id/methods/:methodId`
- `GET /contacts/:id/relationships`, `POST /relationships`, `GET/PATCH/DELETE /relationships/:id`, `GET /relationship-types`
- `GET /contacts/:id/interactions`, `GET/POST /interactions`, `GET/PATCH/DELETE /interactions/:id`
- `GET/POST /contacts/:id/life-events`, `GET/PATCH/DELETE /life-events/:id`
- `GET /contacts/:id/activity` (merged feed), `GET /activity` (raw log)
- `POST/DELETE /contacts/:id/avatar` (multipart `file` = cropped avatar, optional `original` = full photo), `POST /interactions/:id/files`, `GET /contacts/:id/files`, `GET /files/:id`, `DELETE /files/:id`
- `GET /search?q=`, `GET/POST /tags`, `PATCH/DELETE /tags/:id`
- `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout`
- `POST /dev/seed` (only when `ENVIRONMENT=development`)

## Ask

The **Ask** tab is a chat over your CRM data ("When did I last speak to Alice, and what about?"). The model investigates with read-only tools (`search_contacts`, `get_contact`, `list_interactions`, `get_interaction`, `get_activity`, `list_life_events`) and can *propose* any change (new interactions and contacts; edits to names, pronouns, birthday, how-we-met, job and employer, custom fields, tags, contact methods, relationships, life events and existing interactions; archiving and deletions) that you apply with a button; it never writes on its own. Conversations live in the browser only. You can paste or attach a screenshot and ask the model to describe or log it.

The backend speaks the **OpenAI Chat Completions** wire format, so any compatible server works: Cloudflare AI Gateway, Anthropic's compatibility layer, llama.cpp, OpenRouter… Provider choice is pure configuration.

| Setting | Where | Meaning |
|---|---|---|
| `AI_BASE_URL` | var | OpenAI-compatible base URL (requests go to `{base}/chat/completions`) |
| `AI_MODEL` | var | Model name as the provider expects it |
| `AI_LABEL` | var | Shown in the Ask header |
| `AI_EXTRA_BODY` | var, optional JSON object | Merged into every request, e.g. `{"thinking":{"type":"adaptive"}}` |
| `AI_API_KEY` | secret | Provider key. `none` (or empty) sends **no** `Authorization` header, which is what BYOK gateways need to substitute their stored key and what llama.cpp expects |
| `AI_EXTRA_HEADERS` | secret, optional JSON object | Extra headers, e.g. `{"cf-aig-authorization":"Bearer <token>"}` |

Set vars in `wrangler.jsonc`, secrets with `npx wrangler secret put <NAME>`; locally put all of them in `.dev.vars`. These are the deployment defaults.

**Changing the provider on the fly:** admins get an **Ask provider** card on the Account page. Pick a preset (Cloudflare AI Gateway, OpenAI, Anthropic, OpenRouter, llama.cpp, custom), fill in the base URL, model, key and any extra headers or request fields, press **Test** to run a one-token completion against the unsaved values, then **Save**. Saved settings take effect on the next question without a redeploy and override the vars above; **Use deployment settings** removes them again. They live in the `app_settings` table; the API key and extra headers are encrypted with AES-GCM under a key derived from `SESSION_SECRET` and are never returned to the browser (the UI only shows whether they are set). Rotating `SESSION_SECRET` therefore also invalidates the stored secrets; re-enter them.

Presets:

1. **Cloudflare AI Gateway compat + BYOK (default in `wrangler.jsonc`)** — base `https://gateway.ai.cloudflare.com/v1/<account>/opsec/compat`, model `{provider}/{model}` such as `openai/gpt-5.6-luna` (current default) or `anthropic/claude-sonnet-5`, key `none`, headers `{"cf-aig-authorization":"Bearer <AI Gateway Run token>"}`. Setup steps below. Note for `gpt-5.6-luna`: OpenAI rejects function tools on `/chat/completions` unless `reasoning_effort` is `none` (the alternative is the Responses API, which Ask does not speak), so the default sets `AI_EXTRA_BODY={"reasoning_effort":"none"}`; drop that field when using another model.
2. **AI Gateway → Anthropic compat** — base `https://gateway.ai.cloudflare.com/v1/<account>/opsec/anthropic/v1`, model `claude-sonnet-5`, same headers. Use this if the compat endpoint does not pass tool calls or images through.
3. **Anthropic direct** — base `https://api.anthropic.com/v1`, model `claude-sonnet-5`, key = your Anthropic API key.
4. **llama.cpp** — base `http://host:8080/v1`, key `none`, `AI_EXTRA_BODY={"parallel_tool_calls":true}` if the model supports it. Start `llama-server --jinja` with a tool-capable chat template (and `--mmproj` for images). A deployed Worker needs a tunnel (e.g. `cloudflared`) to reach a LAN box; `npm run dev` can use `localhost` directly.
5. **OpenRouter / other gateways** — their base URL, key and model naming.

### Setting up the default preset (AI Gateway + BYOK)

Wrangler has no AI Gateway commands, so the gateway side is done in the Cloudflare dashboard.

1. **Create the gateway.** Dashboard → AI → AI Gateway → *Create Gateway*, name `opsec`. The `AI_BASE_URL` in `wrangler.jsonc` already points at `…/<account>/opsec/compat`; if you pick another name, change that var.
2. **Make it authenticated.** Open the gateway → *Settings* → *Authentication*: create a token of type **AI Gateway Run**, copy it into your secret manager, and turn **Authenticated Gateway** on. BYOK requires an authenticated gateway.
3. **Store the provider key in the gateway.** Gateway → *Provider Keys* → add the provider named in `AI_MODEL` (**OpenAI** for the default, or Anthropic), alias `default`, paste its API key. The Worker never sees this key.
4. **Give the Worker the gateway token.** From the repo, paste the value at the prompt (never into a chat, shell history or commit):

   ```sh
   npx wrangler secret put AI_EXTRA_HEADERS   # {"cf-aig-authorization":"Bearer <AI Gateway Run token>"}
   npx wrangler secret put AI_API_KEY         # none
   ```

   Secrets apply immediately; no redeploy is needed. For local dev put the same two lines in `.dev.vars` (see `.dev.vars.example`).
5. **Check it.** A credential-free `POST …/opsec/compat/chat/completions` returns 401 `Unauthorized` from AI Gateway once the gateway exists and is authenticated. Then open `/ask` and ask "Who is Rex?" (after `POST /api/dev/seed` locally): the trail should show a `search_contacts` call followed by an answer. Error codes in the UI: `provider_auth` → the gateway token; `upstream 4xx` → the provider key or model name; no tool call ever appearing → the compat endpoint is not passing tools through, switch to preset 2.
6. **Optional privacy.** AI Gateway logs prompts and responses by default. Add `"cf-aig-collect-log-payload":"false"` to `AI_EXTRA_HEADERS` to keep payloads out of the gateway logs.

The request sets `max_completion_tokens` (OpenAI rejects the older `max_tokens` on current models); a server that only understands `max_tokens` can be given it through the extra request fields.

**Spend control.** Per-request caps below bound a single question; only the last 20 turns (6,000 characters each) are sent to the model. Overall spend is best managed where the bill is: a budget on the provider account, and rate limiting on the AI Gateway when you route through one.

Limits per question: 12 model iterations, 6 tool calls per iteration, 12 KB per tool result, 120 KB of tool results in total, 40 turns of history, one image up to 1568 px on the long edge. Worker logs record only counts and timings, never questions, tool payloads or images.

## MCP server and API tokens

The Worker is also a [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp` (stateless Streamable HTTP), so Claude Code, Claude Desktop, ChatGPT and other MCP clients can use your CRM directly. Create a token under **Account → API tokens**, choosing *read only* or *read and write*, then:

```sh
claude mcp add opsec --transport http https://<your host>/mcp --header "Authorization: Bearer <token>"
```

- **Read tools** are the Ask read tools: `search_contacts`, `get_contact`, `list_interactions`, `get_interaction`, `get_activity`, `list_life_events`.
- **Write tools** (write-scoped tokens only) are the Ask proposal tools applied immediately through the app's own API, so validation and the activity log are identical to the UI: `create_contact`, `update_contact`, `set_tags`, `contact_method`, `relationship`, `life_event`, `create_interaction`, `update_interaction`, `delete_interaction`, `append_contact_note`, `archive_contact`. Removals, deletions and archiving must be called again with `confirm: true`.
- The same token works for the JSON API (`Authorization: Bearer …`); read-only tokens are refused for anything but GET. Tokens act as the user who created them, are stored hashed, can be revoked at any time, and cannot mint or revoke other tokens.

## Security notes

- **Sessions**: HS256-signed `HttpOnly; Secure; SameSite=Lax` cookies (oidc mode); the access policy is re-checked on every request. `SESSION_SECRET` must be at least 32 characters.
- **CSRF**: state-changing `/api/*` requests are refused when the browser reports a cross-site or cross-origin fetch (`Sec-Fetch-Site` / `Origin`), on top of SameSite cookies.
- **Headers**: HSTS, a CSP that allows only same-origin scripts and connections, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies, on every response including static assets.
- **Files**: the stored content type of an upload comes from its bytes for the formats shown inline (PNG, JPEG, GIF, WebP, PDF); anything else downloads as an attachment with a generic type, and every file response carries a sandboxing CSP. Avatars must be raster images (never SVG). Uploads require `Content-Length` and JSON bodies are capped.
- **Ask**: tools are read-only; the model can only propose changes that you apply. Markdown from notes or the model never renders remote images. Stored provider secrets are bound to the base URL's origin: changing the host clears them so the Worker cannot be used to read a key back. Provider error bodies are not echoed to the browser.
- **Dev routes** (`/api/dev/*`) only exist on `localhost` with `ENVIRONMENT=development`.
- **Admin role** gates cascade deletes of contacts and tags and the provider settings. Everyone allowed in can otherwise edit and delete records; run one instance per person, or put a stricter gate in front.

## Deploying

One-time: the D1 database `nexus-db` and R2 bucket `nexus-files` already exist and are
referenced in `wrangler.jsonc` (Cloudflare cannot rename them; they keep the project's old
name). The Worker is `opsec`. The custom domains `opsec.cubityfir.st`, `opsec.nexus`, and the legacy
`nexus.cubityfir.st` (which redirects) are created from the `routes` entries on first deploy
(the zone must be on the same Cloudflare account).

```bash
npm run db:migrate:remote
npm run deploy
curl https://opsec.cubityfir.st/api/health
```

## Schema changes

1. Edit `src/worker/db/schema.ts`
2. `npm run db:generate` and review the SQL in `drizzle/`
3. `npm run db:migrate:local`, run tests, commit the migration
4. `npm run db:migrate:remote` before deploying
