// Signed, stateless unsubscribe tokens (Product Track slice 8A, see
// ROADMAP.md) — no login required for a lead to opt out, and no guessable
// bare ID as the sole authority (task Phase C10: "keine erratbaren IDs als
// alleinige Auth"). The token IS the credential: anyone holding a valid
// token can suppress exactly the (companyId, email) pair it was signed
// for, nothing else — never a bare recipient/lead/followup id trusted on
// its own.
//
// Deliberately no expiry (task Phase C10 allows but doesn't require one):
// an unsubscribe link that stops working after some weeks and then
// silently fails to opt someone out is a worse outcome than a link that
// stays valid indefinitely — this is a "stop contacting me" signal, not a
// time-limited offer.
//
// Deterministic HMAC, not random-plus-lookup-table: signing the same
// (companyId, email) pair twice produces the same token, so no server-side
// token storage is needed at all — verification is pure, given the secret.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type UnsubscribeTokenPayload = {
  companyId: string;
  email: string;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** Same "hash both sides to a fixed digest before comparing" discipline as
 * followups.process.ts's timingSafeEqualStrings — avoids a length-based
 * short-circuit being any kind of timing signal, even though a base64url
 * SHA-256 signature is already fixed-length in practice. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function signUnsubscribeToken(payload: UnsubscribeTokenPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export type VerifyUnsubscribeTokenResult =
  | { ok: true; payload: UnsubscribeTokenPayload }
  | { ok: false; reason: "malformed" | "invalid_signature" | "invalid_payload" };

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): VerifyUnsubscribeTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload, secret);
  if (!timingSafeEqualStrings(signature, expectedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).companyId !== "string" ||
    typeof (parsed as Record<string, unknown>).email !== "string"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }
  return { ok: true, payload: parsed as UnsubscribeTokenPayload };
}
