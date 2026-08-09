// Resend webhook signature verification (Product Track slice 8A, see
// ROADMAP.md) — uses the official `svix` npm package (Resend's webhooks
// are delivered via Svix, confirmed against Resend's own docs), not a
// hand-rolled HMAC comparison. Task instruction: "Keine Webhook-Security
// aus Erinnerung implementieren" — the well-audited official library is
// the correct choice here, not a reimplementation risk.
import { Webhook } from "svix";

export type WebhookVerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: "missing_headers" | "invalid_signature" };

/** `rawBody` MUST be the exact, unparsed request body text — Resend's own
 * docs are explicit that re-serializing a parsed-and-reparsed JSON body
 * breaks signature verification, so this never accepts an already-parsed
 * object. `secret` is the Resend/Svix webhook signing secret
 * (EMAIL_PROVIDER_WEBHOOK_SECRET), read by the caller only — never inside
 * this module. */
export function verifyResendWebhook(args: {
  rawBody: string;
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  };
  secret: string;
}): WebhookVerifyResult {
  const { svixId, svixTimestamp, svixSignature } = args.headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing_headers" };
  }
  try {
    const webhook = new Webhook(args.secret);
    const payload = webhook.verify(args.rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    return { ok: true, payload };
  } catch {
    // svix throws on any verification failure (bad signature, expired
    // timestamp, malformed header) — never surface the raw exception
    // message in a response, just the fact that it failed.
    return { ok: false, reason: "invalid_signature" };
  }
}
