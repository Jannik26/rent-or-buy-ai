// Signed, stateless inbound-reply tokens (Product Track slice 8B, see
// ROADMAP.md) — routes an inbound email to exactly the conversation it was
// signed for, nothing else. Same HMAC shape as unsubscribe-token.ts, but
// deliberately a SEPARATE secret (EMAIL_INBOUND_TOKEN_SECRET, never
// EMAIL_UNSUBSCRIBE_SECRET) — these are different authority domains (one
// grants "route mail into this conversation", the other grants "suppress
// this address"), and reusing one secret for both would let a leaked
// unsubscribe link forge a reply-routing token or vice versa.
//
// Deterministic, not persisted-random (task Phase 20 — explicit choice,
// justified): the payload is exactly `{conversationId}` — never
// `companyId` as the trust anchor (task Phase 2's explicit instruction);
// company_id is always re-derived server-side from the resolved
// conversation row, never taken from the token or the request. No
// expiry — a reply thread should stay addressable for the life of the
// conversation, not silently break after N days. Rotation is possible by
// rotating EMAIL_INBOUND_TOKEN_SECRET, which invalidates every
// outstanding token at once (coarse-grained, no per-token revocation) —
// an acceptable trade-off for a v1: no server-side token storage needed
// at all, verification is pure given the secret.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ReplyTokenPayload = {
  conversationId: string;
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

/** Same "hash both sides before comparing" discipline as
 * followups.process.ts's timingSafeEqualStrings / unsubscribe-token.ts. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function signReplyToken(payload: ReplyTokenPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export type VerifyReplyTokenResult =
  | { ok: true; payload: ReplyTokenPayload }
  | { ok: false; reason: "malformed" | "invalid_signature" | "invalid_payload" };

export function verifyReplyToken(token: string, secret: string): VerifyReplyTokenResult {
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
    typeof (parsed as Record<string, unknown>).conversationId !== "string"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }
  return { ok: true, payload: parsed as ReplyTokenPayload };
}

/** The local-part convention every inbound-reply address uses:
 * `reply+<token>@<inbound-domain>`. Base64url only ever produces
 * `[A-Za-z0-9_-]`, plus the single literal `.` this module inserts between
 * the payload and signature segments — all valid, unquoted email
 * local-part characters (RFC 5322 atext + the internal-dot exception),
 * so the resulting address never needs quoting. */
export function buildReplyAddress(token: string, inboundDomain: string): string {
  return `reply+${token}@${inboundDomain}`;
}

/** Reverses buildReplyAddress — extracts the token from a `reply+X@domain`
 * local part. Returns null for anything that doesn't match the exact
 * convention (no silent partial matches). */
export function extractReplyToken(address: string): string | null {
  const at = address.indexOf("@");
  if (at === -1) return null;
  const localPart = address.slice(0, at);
  if (!localPart.startsWith("reply+")) return null;
  const token = localPart.slice("reply+".length);
  return token.length > 0 ? token : null;
}
