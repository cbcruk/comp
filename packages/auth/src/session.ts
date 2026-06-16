import { bytesToBase64Url, base64UrlToBytes, encodeUtf8 } from "./base64url.js";

const decoder = new TextDecoder();

export interface SessionPayload {
  subject: string;
  roles?: string[];
  /** Expiry as epoch milliseconds. */
  exp?: number;
  [key: string]: unknown;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a session payload into a `body.signature` token (HMAC-SHA-256). */
export async function signSession(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const body = bytesToBase64Url(encodeUtf8(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encodeUtf8(body)),
  );
  return `${body}.${bytesToBase64Url(signature)}`;
}

/**
 * Verify a token and return its payload, or null if the signature is invalid,
 * the token is malformed, or it has expired. Signature comparison is delegated
 * to Web Crypto's constant-time verify.
 */
export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlToBytes(signaturePart);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encodeUtf8(body),
  );
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(body)));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp <= now) return null;
  return payload;
}
