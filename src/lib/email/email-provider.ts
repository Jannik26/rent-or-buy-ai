// Neutral E-Mail delivery model (Product Track slice 7, see ROADMAP.md).
//
// This is the "Provider Adapter" layer in the required chain:
//   EstateAI Domain Logic → Delivery Adapter → Provider Adapter → externer
//   E-Mail-Provider
// (see src/lib/followups/email-delivery-adapter.ts for the Delivery Adapter
// half, and src/lib/email/providers/resend-provider.ts for the one concrete
// Provider Adapter this slice ships).
//
// Nothing provider-specific belongs in this file or in any type it exports —
// no Resend request/response shapes leak past providers/resend-provider.ts.
// Deliberately small: only what EstateAI's follow-up use case actually
// needs, not a general-purpose email SDK surface.

/** A single named participant — sender identity, reply-to, or recipient.
 * `name` is optional (a bare recipient address has no display name; a
 * sender always should, see resolveSenderIdentity in email-rules.ts). */
export type EmailAddress = {
  email: string;
  name?: string;
};

/** Everything a provider needs to send one email. `idempotencyKey` is
 * mandatory, not optional — see email-delivery-adapter.ts's doc comment for
 * why every send in this codebase is required to carry one (the crash-window
 * analysis in ROADMAP.md this design is based on). `text` is required (Phase
 * 10: "E-Mails sollen mindestens eine robuste Plain-Text-Version besitzen");
 * `html` is optional. */
export type EmailMessage = {
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  /** Extra provider-agnostic email headers — currently only used for
   * List-Unsubscribe/List-Unsubscribe-Post (Product Track slice 8A, RFC
   * 8058 one-click unsubscribe), never for anything security-relevant
   * (never Authorization, never anything provider-secret-derived). */
  headers?: Record<string, string>;
};

/**
 * Three-way outcome, not a boolean — Phase 17's explicit requirement:
 * "Nicht so tun, als sei API accepted gleichbedeutend mit im Postfach
 * zugestellt." `accepted` means the provider took responsibility for the
 * message (queued/sent from EstateAI's point of view); it is not proof of
 * inbox delivery (that's what bounce/delivered webhooks would tell us — see
 * ROADMAP.md's Phase 18 writeup for why that's explicitly out of scope this
 * slice). `rejected` is used for both permanent provider-side rejections
 * (invalid address) and transient ones (timeout/429/5xx) — the two are
 * distinguished via `retryable`, not via separate outcome variants, since
 * every caller needs to handle "did it work" first and "should this be
 * retried" second.
 */
export type EmailSendResult =
  | { outcome: "accepted"; providerMessageId: string }
  | { outcome: "rejected"; retryable: boolean; errorCode: string };

/** The one interface every concrete provider (Resend today, anything else
 * later) must implement. No provider-specific config (API keys, base URLs)
 * in this interface — those are constructor-time concerns of the concrete
 * implementation, not part of the shape callers depend on. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
