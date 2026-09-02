/**
 * AES-GCM encryption for secret-bearing app settings stored in D1. The key is
 * derived (HKDF-SHA256) from SESSION_SECRET, so rotating that secret makes
 * stored ciphertext unreadable; the settings UI then simply asks for the
 * values again.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const VERSION = "v1";

async function deriveKey(secret: string, info: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("opsec"), info: enc.encode(info) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function encryptString(secret: string, plain: string, info = "app-settings"): Promise<string> {
  const key = await deriveKey(secret, info);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return `${VERSION}.${b64(iv)}.${b64(ct)}`;
}

export async function decryptString(secret: string, blob: string, info = "app-settings"): Promise<string> {
  const [v, ivB, ctB] = blob.split(".");
  if (v !== VERSION || !ivB || !ctB) throw new Error("Unrecognised ciphertext");
  const key = await deriveKey(secret, info);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB) as BufferSource }, key, unb64(ctB) as BufferSource);
  return dec.decode(plain);
}
