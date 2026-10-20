# Deploying and authentication

For a first deploy of your own instance, see [README → Deploy your own](../README.md#deploy-your-own).

## Authentication

Two modes, chosen by the `AUTH_MODE` var:

- **`open`** (default): no sign-in. Every request runs as a single implicit owner (`sub` = `local`, admin). Use it behind your own gate, or for local development.
- **`oidc`**: "Sign in with <provider>" using OpenID Connect (Authorization Code + PKCE, `state` and `nonce`, discovery from `OIDC_ISSUER`) via openid-client. Sessions are HS256-signed cookies keyed on the `sub` claim, never on email. Access is limited to accounts with the `admin` role plus verified emails listed in `ACCESS_ALLOWED_EMAILS`; the policy is checked at sign-in and on every request, so revoking someone locks existing cookies out immediately. Destructive routes additionally require the `admin` role. Scopes: `openid profile email roles`.

Config for `oidc` mode: vars `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `AUTH_PROVIDER_LABEL`, `ACCESS_ALLOWED_EMAILS`; secrets `OIDC_CLIENT_SECRET`, `SESSION_SECRET`. Redirect URI: `https://<host>/api/auth/callback`.

In `open` mode behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/), the app probes `/cdn-cgi/access/get-identity`, which Cloudflare only serves on hostnames covered by an Access application; when that answers, the Account page drops the open-access warning and names the identity that let you in instead. Access visitors still share the single owner account, so the policy is what decides who gets in.

The author's instance (`env.prod` in `wrangler.jsonc`) signs in through Annex, a private provider on the same Cloudflare zone. Because a Worker's fetch to a same-zone hostname skips that hostname's Worker, its token, JWKS and userinfo calls go through a service binding; that binding is optional and only used when present.

## The author's instance

One-time: the D1 database `nexus-db` and R2 bucket `nexus-files` already exist and are
referenced in `wrangler.jsonc` (Cloudflare cannot rename them; they keep the project's old
name). The Worker is `opsec`. The custom domains `opsec.cubityfir.st`, `opsec.nexus`, and the legacy
`nexus.cubityfir.st` (which redirects) are created from the `routes` entries on first deploy
(the zone must be on the same Cloudflare account).

```bash
npm run deploy:prod        # build with CLOUDFLARE_ENV=prod, apply migrations, deploy
curl https://opsec.cubityfir.st/api/auth/login -o /dev/null -w "%{redirect_url}\n"   # must point at the identity provider
```

`npm run deploy` (no `:prod`) deploys the **top-level template**: open access, a fresh `opsec-db`, no
Annex binding. Because the template and `env.prod` share the Worker name `opsec`, running it against
this account silently switches production to open access and an empty database (sign-in then fails
with "Internal error"). Only use it on a self-hosted account.

### Workers Builds (GitHub → Cloudflare)

The same trap applies to the dashboard's automatic builds, whose defaults are `npm run build` and
`npx wrangler deploy`. In **Workers & Pages → opsec → Settings → Builds**, set:

| Setting | Value |
|---|---|
| Build command | `npm run ci:build` (runs `build:prod`) |
| Deploy command | `npm run ci:deploy` (applies D1 migrations with `--env prod`, then `npx wrangler deploy`) |

The build emits `dist/opsec/wrangler.json` already flattened to `env.prod`, and `npx wrangler deploy`
picks it up through `.wrangler/deploy/config.json`. Secrets (`SESSION_SECRET`, `OIDC_CLIENT_SECRET`,
`AI_API_KEY`) live on the Worker and survive deploys.

## Schema changes

1. Edit `src/worker/db/schema.ts`
2. `npm run db:generate` and review the SQL in `drizzle/`
3. `npm run db:migrate:local`, run tests, commit the migration
4. `npm run db:migrate:remote` before deploying
