import { SIGNED_OUT_PATH } from "@shared/auth";
import type { WorkerEnv } from "../env";
import * as client from "openid-client";
import { ApiError } from "../lib/errors";

export const OIDC_SCOPE = "openid profile email roles";

/**
 * Fetch used by openid-client for discovery, JWKS, token and userinfo calls.
 *
 * The author's provider (auth.cubityfir.st, the `cubityfirst-auth` Worker)
 * lives on the same Cloudflare zone as this Worker. A plain `fetch()` from a
 * Worker to a same-zone hostname does not run that hostname's Worker; it goes
 * straight to the origin. So in production every request to the issuer host
 * is sent through the `IDP` service binding instead. Local dev has no binding
 * and talks to the provider over the public edge like any client.
 */
export function providerFetch(env: WorkerEnv): client.CustomFetch {
  const issuerHost = new URL(env.OIDC_ISSUER ?? "").host;
  // Optional service binding for same-zone providers; plain fetch otherwise.
  const binding = env.ENVIRONMENT === "development" ? undefined : (env as { IDP?: Fetcher }).IDP;
  return (url, options) => {
    const init = options as RequestInit;
    if (binding && new URL(url).host === issuerHost) return binding.fetch(url, init);
    return fetch(url, init);
  };
}

let cached: { key: string; promise: Promise<client.Configuration> } | undefined;

/**
 * Discover the provider (endpoints, JWKS URI, supported algs) from the
 * issuer's well-known document. Cached per isolate; a failed discovery is
 * not cached so a transient outage does not poison the Worker.
 *
 * openid-client skips the id_token's JWS signature check by default (OIDC Core
 * allows that for tokens fetched straight from the token endpoint over TLS);
 * `enableNonRepudiationChecks` turns it on, as the provider asks. The JWKS is
 * fetched through `providerFetch` too and cached per isolate for up to five
 * minutes; a token naming a `kid` the cache lacks forces a re-fetch once the
 * copy is a minute old, so key rotation needs nothing here.
 */
export function getOidcConfig(env: WorkerEnv): Promise<client.Configuration> {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) {
    return Promise.reject(new ApiError(500, "internal", "Sign-in is not configured: set the OIDC_ISSUER and OIDC_CLIENT_ID vars (AUTH_MODE=oidc)."));
  }
  // Fail here, with a clear message, rather than deep inside the token exchange.
  if (typeof env.OIDC_CLIENT_SECRET !== "string" || env.OIDC_CLIENT_SECRET.length === 0) {
    return Promise.reject(
      new ApiError(500, "internal", "Sign-in is not configured: OIDC_CLIENT_SECRET is missing. Set it with `npx wrangler secret put OIDC_CLIENT_SECRET --name opsec` (or in .dev.vars locally)."),
    );
  }
  const key = `${env.OIDC_ISSUER}|${env.OIDC_CLIENT_ID}`;
  if (cached?.key === key) return cached.promise;
  const promise = client
    .discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, undefined, client.ClientSecretPost(env.OIDC_CLIENT_SECRET), {
      [client.customFetch]: providerFetch(env),
      execute: [client.enableNonRepudiationChecks],
    })
    .catch((e) => {
      if (cached?.promise === promise) cached = undefined;
      throw e;
    });
  cached = { key, promise };
  return promise;
}

/** Must match the redirect URI registered with the provider byte for byte. */
export function redirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/api/auth/callback`;
}

/**
 * Where the provider sends the browser after RP-initiated logout: this instance's signed-out
 * page (`https://<host>/signed-out`). Register it byte for byte as a post-logout redirect URI
 * for the client.
 */
export function postLogoutRedirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}${SIGNED_OUT_PATH}`;
}

export { client };
