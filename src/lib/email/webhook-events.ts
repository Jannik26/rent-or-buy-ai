// Pure parsing/mapping for Resend webhook payloads (Product Track slice
// 8A, see ROADMAP.md) — separated from webhook-verification.ts (which only
// verifies the signature and hands back the raw parsed JSON) and from
// email-webhook.functions.ts (which does the actual DB writes), so the
// "what does this payload mean" logic is unit-testable without a real
// signature or a real DB.
//
// Payload shapes verified against Resend's own documented examples for
// email.bounced/email.complained (https://resend.com/docs/webhooks/emails/
// bounced, .../complained) — not invented. Every Resend event shares the
// same envelope: `{ type, created_at, data: { email_id, to, ... } }`.

export type ParsedResendWebhookEvent = {
  type: string;
  emailId: string | null;
  recipients: string[];
  bounceType: "hard" | "soft" | null;
};

/** Returns null only for a payload that isn't even the right shape at all
 * (missing/non-string `type`) — an unrecognized but well-shaped `type`
 * (e.g. a future Resend event this slice doesn't know about) still parses
 * successfully with emailId/recipients/bounceType extracted as available,
 * so the webhook handler can still ack it and record it for dedup even
 * though it won't map to a delivery_status change. */
export function parseResendWebhookPayload(payload: unknown): ParsedResendWebhookEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.type !== "string") return null;

  const data =
    typeof envelope.data === "object" && envelope.data !== null
      ? (envelope.data as Record<string, unknown>)
      : {};

  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  const recipients = Array.isArray(data.to)
    ? data.to.filter((entry): entry is string => typeof entry === "string")
    : [];

  let bounceType: "hard" | "soft" | null = null;
  if (typeof data.bounce === "object" && data.bounce !== null) {
    const bounce = data.bounce as Record<string, unknown>;
    // Resend/AWS SES bounce classification is "Permanent"/"Transient"/
    // "Undetermined" (capitalized) — not the "hard"/"soft" strings our own
    // DB CHECK constraint uses. Only an explicit "Permanent" maps to our
    // 'hard' — everything else (including "Undetermined") is treated as
    // 'soft', the more conservative choice for a value that isn't clearly
    // permanent (task Phase C7: only suppress immediately when the bounce
    // type clearly justifies it).
    bounceType = bounce.type === "Permanent" ? "hard" : "soft";
  }

  return { type: envelope.type, emailId, recipients, bounceType };
}

export type MappedDeliveryStatus = "delivered" | "bounced" | "complained" | "deferred";

/** Only the event types this slice actually acts on (task Phase C6/C18) —
 * `email.sent` is deliberately not mapped here: the worker itself already
 * sets delivery_status='accepted' synchronously at send time (see
 * followups.functions.ts), so a webhook-driven "sent" would be redundant.
 * Anything else (opened/clicked/unknown future types) returns null — still
 * acknowledged and recorded for dedup by the caller, just no
 * delivery_status change. */
export function mapEventTypeToDeliveryStatus(eventType: string): MappedDeliveryStatus | null {
  switch (eventType) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.delivery_delayed":
      return "deferred";
    default:
      return null;
  }
}
