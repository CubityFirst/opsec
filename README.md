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

opsec▮ keeps everyone you know in one graph. A contact can be a person, a pet or an organisation, and any contact can be related to any other: Rex is Alice's dog, Acme Ltd is Sam's employer, Jo is a member of the Hill family. Around each contact sits everything you would otherwise keep in your head — how you met, phone numbers and addresses, tags, notes, photos, life events, and a feed of every interaction — so "when did we last speak, and about what" is always one click away.

It runs as a single Cloudflare Worker with D1 for data and R2 for files, and costs pennies a month.

## Highlights

- **One graph, three kinds.** Typed, directional relationships ("X is the *parent* of Y") with the other side derived automatically.
- **Interactions with context.** Calls, meals, meetings and notes with participants, markdown, a location and attachments; `@mentions` and `#tags` link everywhere.
- **The details that matter.** Job and employer, how you met, life events, partial dates (a birthday without a year), other names, pronouns, religion, country of origin, and a deceased state that keeps history intact.
- **Reminders, gifts and bets.** Recurring to-dos, gift ideas and what was given, and predictions you have staked something on — all surfaced on the dashboard when they come due.
- **Timeline and map.** Everything across everyone one month at a time, and contacts and interactions pinned where they happened (OpenStreetMap).
- **Ask.** A chat over your own data that investigates with read-only tools and proposes changes you apply with a button. Any OpenAI-compatible provider.
- **MCP and calendar feeds.** Use the CRM from Claude, ChatGPT and other MCP clients, and subscribe to birthdays and reminders in any calendar app.
- **Installable and yours.** A PWA that never caches your data, OpenID Connect sign-in with an allow-list, encrypted secrets, your own branding, no analytics.

## Deploy your own

The **Deploy to Cloudflare** button above forks this repository and creates the Worker, a D1 database and an R2 bucket, runs the migrations and deploys it to a `workers.dev` URL. From your own machine instead: clone, `npm install`, `npx wrangler login`, `npm run deploy`.

> **A fresh install has no authentication.** `AUTH_MODE` defaults to `open`: every visitor is treated as the owner with admin rights, so an open instance on a public URL is an open address book. Before you put anything real in it, do one of:
>
> 1. **Put a gate in front**, e.g. [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) on the Worker's hostname. No code changes; the app notices Access and says so on the Account page.
> 2. **Turn on OpenID Connect sign-in**: vars `AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `AUTH_PROVIDER_LABEL`, `ACCESS_ALLOWED_EMAILS`; secrets `OIDC_CLIENT_SECRET`, `SESSION_SECRET`; redirect URI `https://<your host>/api/auth/callback`. See [docs/deploying.md](docs/deploying.md#authentication).

Then open **Account → Ask provider** to point Ask at a model (none is configured by default). Storing an API key there needs the `SESSION_SECRET` secret (`npx wrangler secret put SESSION_SECRET`); key-less providers do not. See [docs/ask.md](docs/ask.md).

## Development

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in OIDC_CLIENT_SECRET and a random SESSION_SECRET
npm run db:migrate:local         # apply migrations to the local D1
npm run dev                      # Vite + Worker at http://localhost:5173 (local D1/R2 under .wrangler/state)
npm run seed                     # optional sample data
```

For local OIDC sign-in, register `http://localhost:5173/api/auth/callback` with your provider.

| Script | What it does |
|---|---|
| `npm test` | API tests in workerd against an isolated D1 + R2 |
| `npm run typecheck` | Typecheck all projects |
| `npm run build` | Typecheck and build client + Worker into `dist/` |
| `npm run db:generate` | Generate a SQL migration from `src/worker/db/schema.ts` |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply migrations to local / production D1 |
| `npm run types` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |

Stack: Hono on Workers, D1 via Drizzle, R2, React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Query.

```
src/shared/     zod input schemas + response types shared by API and UI
src/worker/     Hono app: db/ (Drizzle schema), routes/, services/, lib/
src/web/        React SPA (shadcn components in components/ui)
drizzle/        SQL migrations
test/           vitest + @cloudflare/vitest-pool-workers API tests
```

## Documentation

- [Deploying and authentication](docs/deploying.md) — auth modes, production deploys, Workers Builds, schema changes
- [Ask and MCP](docs/ask.md) — provider configuration, AI Gateway setup, limits, MCP server and API tokens
- [Reference](docs/reference.md) — data model, API routes, calendar feeds, map, branding
- [Security and privacy](docs/security.md) — sessions, headers, files, and what talks to the outside world

Bug reports and pull requests are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) has the checks to run and the commit convention.
