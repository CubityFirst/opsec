import * as client from "openid-client";
import { ApiError } from "../lib/errors";

export const OIDC_SCOPE = "openid profile email roles";

/**
 * Fetch used by openid-client for discovery, JWKS, token and userinfo calls.
 *
 * Annex lives on the same Cloudflare zone as this Worker. A plain `fetch()`
 * from a Worker to a same-zone hostname does not run that hostname's Worker;
 * it goes straight to the origin. So in production every request to the
 * issuer host is sent through the `ANNEX` service binding instead. Local dev
 * has no binding and talks to Annex over the public edge like any client.
 */
export function annexFetch(env: Env): client.CustomFetch {
  const issuerHost = new URL(env.OIDC_ISSUER).host;
  const binding = env.ENVIRONMENT === "development" ? undefined : env.ANNEX;
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
 */
export function getOidcConfig(env: Env): Promise<client.Configuration> {
  // Fail here, with a clear message, rather than deep inside the token exchange.
  if (typeof env.OIDC_CLIENT_SECRET !== "string" || env.OIDC_CLIENT_SECRET.length === 0) {
    return Promise.reject(
      new ApiError(500, "internal", "Sign-in is not configured: OIDC_CLIENT_SECRET is missing. Set it with `npx wrangler secret put OIDC_CLIENT_SECRET` (or in .dev.vars locally)."),
    );
  }
  const key = `${env.OIDC_ISSUER}|${env.OIDC_CLIENT_ID}`;
  if (cached?.key === key) return cached.promise;
  const promise = client
    .discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, undefined, client.ClientSecretPost(env.OIDC_CLIENT_SECRET), {
      [client.customFetch]: annexFetch(env),
    })
    .catch((e) => {
      if (cached?.promise === promise) cached = undefined;
      throw e;
    });
  cached = { key, promise };
  return promise;
}

/** Must match the redirect URI registered with Annex byte for byte. */
export function redirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/api/auth/callback`;
}

export { client };
