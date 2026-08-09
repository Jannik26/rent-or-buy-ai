// Pure parsing for Resend inbound webhook payloads (Product Track slice 8B,
// see ROADMAP.md) — the inbound counterpart to webhook-events.ts. Kept as a
// SEPARATE parser rather than extended onto parseResendWebhookPayload: the
// envelope (`{ type, created_at, data: {...} }`) is the same Resend/Svix
// shape, but `data`'s fields are entirely different (from/to/attachments
// metadata, no bounce/delivery info) — folding both into one function would
// make neither shape's required fields clear.
//
// Verified against Resend's own documented `email.received` webhook payload
// (task Phase 1: no implementing from memory) — the webhook body is
// METADATA ONLY. The actual text/html body is fetched separately via the
// Receiving API (see providers/resend-receiving.ts) using this event's
// `emailId`.

export const INBOUND_EMAIL_EVENT_TYPE = "email.received";

export type ParsedInboundEmailEvent = {
  type: string;
  emailId: string | null;
  from: string | null;
  to: string[];
  attachmentCount: number;
};

export function parseInboundWebhookPayload(payload: unknown): ParsedInboundEmailEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.type !== "string") return null;

  const data =
    typeof envelope.data === "object" && envelope.data !== null
      ? (envelope.data as Record<string, unknown>)
      : {};

  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  const from = typeof data.from === "string" ? data.from : null;
  const to = Array.isArray(data.to) ? data.to.filter((entry): entry is string => typeof entry === "string") : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];

  return { type: envelope.type, emailId, from, to, attachmentCount: attachments.length };
}

/**
 * Finds the one `to` recipient that's actually a reply-routing address on
 * OUR configured inbound domain (`reply+<token>@<inboundDomain>`) — a
 * mail can legitimately have other recipients on the `to`/`cc` line (a
 * lead replying-all, forwarding, etc.), so this doesn't just take
 * `to[0]`.
 *
 * Case handling matters here (task Phase 2/20): the domain comparison is
 * case-insensitive (DNS/email domains are), but the local part — which is
 * where the base64url reply token lives — is returned EXACTLY as
 * received. Lowercasing the whole address, as
 * normalizeEmailAddressForComparison (inbound-sender.ts) does for sender
 * comparison, would corrupt every token (base64url is case-sensitive) —
 * deliberately not reusing that helper here for that reason.
 */
export function findReplyAddress(toAddresses: string[], inboundDomain: string): string | null {
  const normalizedDomain = inboundDomain.trim().toLowerCase();
  if (!normalizedDomain) return null;

  for (const raw of toAddresses) {
    const trimmed = raw.trim();
    // Defensively unwrap a `"Name" <addr@domain>` form some senders/relays
    // may still produce on a `to` line, without touching the case of
    // whatever's inside the angle brackets.
    const angleMatch = trimmed.match(/<([^<>]*)>\s*$/);
    const address = angleMatch ? angleMatch[1] : trimmed;
    const at = address.lastIndexOf("@");
    if (at === -1) continue;
    const domain = address.slice(at + 1).toLowerCase();
    if (domain === normalizedDomain) return address;
  }
  return null;
}
