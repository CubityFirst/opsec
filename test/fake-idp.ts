/**
 * Stand-in for the identity provider Worker behind the `IDP` service binding. vitest.config.ts
 * builds it in the vitest host (it is not a test file), and tests import the small helpers
 * below, so this module sticks to WebCrypto and fetch types that exist on both sides.
 *
 * It serves discovery, a JWKS and a token endpoint that issues RS256 id_tokens, so
 * /auth/login, /auth/callback and /auth/logout run for real up to the browser redirects,
 * including openid-client's signature check. A test picks the identity through the
 * authorization code: `fakeAuthCode()` packs the nonce and PKCE challenge from the login
 * redirect plus the claims to issue, and the token endpoint unpacks it.
 */

export const FAKE_ISSUER = "https://auth.cubityfir.st";

export interface FakeAuthCode {
  nonce: string;
  codeChallenge: string;
  claims: Record<string, unknown> & { sub: string };
  /** Sign with a key that is not in the JWKS. */
  badSignature?: boolean;
}

export function fakeAuthCode(code: FakeAuthCode): string {
  return b64url(new TextEncoder().encode(JSON.stringify(code)));
}

export function fakeDiscovery(issuer = FAKE_ISSUER) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    end_session_endpoint: `${issuer}/oauth/logout`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    // The real provider sends `iss` on the callback (RFC 9207), and openid-client then requires it.
    authorization_response_iss_parameter_supported: true,
  };
}

const KEY_PARAMS = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" } as const;
const KID = "fake-idp-key";

export async function createFakeIdp(opts: { clientId: string; clientSecret: string; issuer?: string }) {
  const issuer = opts.issuer ?? FAKE_ISSUER;
  const key = await rsaKeyPair();
  const strayKey = await rsaKeyPair();
  const publicJwk = (await crypto.subtle.exportKey("jwk", key.publicKey)) as { kty?: string; n?: string; e?: string };
  const jwks = { keys: [{ kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e, alg: "RS256", use: "sig", kid: KID }] };
  // Every response is tagged, so a test can tell the binding answered rather than the network.
  const tagged = { "x-test-idp": "1" };

  async function token(req: Request): Promise<Response> {
    const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: tagged });
    if (req.method !== "POST" || !req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return fail("invalid_request");
    const form = new URLSearchParams(await req.text());
    if (form.get("client_id") !== opts.clientId || form.get("client_secret") !== opts.clientSecret) return fail("invalid_client", 401);
    if (form.get("grant_type") !== "authorization_code" || !form.get("redirect_uri")) return fail("invalid_request");
    let code: FakeAuthCode;
    try {
      code = JSON.parse(new TextDecoder().decode(fromB64url(form.get("code") ?? ""))) as FakeAuthCode;
    } catch {
      return fail("invalid_grant");
    }
    const verifier = form.get("code_verifier") ?? "";
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    if (challenge !== code.codeChallenge) return fail("invalid_grant");

    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: issuer, aud: opts.clientId, iat: now, exp: now + 3600, auth_time: now, nonce: code.nonce, sid: "fake-session", ...code.claims };
    const signing = `${b64url(json({ alg: "RS256", kid: KID, typ: "JWT" }))}.${b64url(json(payload))}`;
    const signer = code.badSignature ? strayKey.privateKey : key.privateKey;
    const signature = new Uint8Array(await crypto.subtle.sign(KEY_PARAMS.name, signer, new TextEncoder().encode(signing)));
    return Response.json(
      { access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600, scope: "openid profile email roles", id_token: `${signing}.${b64url(signature)}` },
      { headers: { ...tagged, "cache-control": "no-store" } },
    );
  }

  return async (req: Request): Promise<Response> => {
    switch (new URL(req.url).pathname) {
      case "/.well-known/openid-configuration":
        return Response.json(fakeDiscovery(issuer), { headers: tagged });
      case "/oauth/jwks":
        return Response.json(jwks, { headers: tagged });
      case "/oauth/token":
        return token(req);
      default:
        return new Response("not available in tests", { status: 503, headers: tagged });
    }
  };
}

/** The worker and Node type libraries name WebCrypto key types differently; derive one both accept. */
type Key = Parameters<typeof crypto.subtle.sign>[1];

async function rsaKeyPair(): Promise<{ publicKey: Key; privateKey: Key }> {
  return (await crypto.subtle.generateKey(KEY_PARAMS, true, ["sign", "verify"])) as unknown as { publicKey: Key; privateKey: Key };
}

function json(v: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(v));
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
