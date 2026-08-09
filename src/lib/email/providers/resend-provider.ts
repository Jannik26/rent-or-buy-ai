// Concrete Resend Provider Adapter (Product Track slice 7, see ROADMAP.md) —
// the only place in this codebase that knows Resend's actual HTTP API
// shape. Everything above this file (email-delivery-adapter.ts and
// everything it calls) only ever sees the neutral EmailProvider/
// EmailSendResult types from ../email-provider.ts — swapping this file for
// a different provider later should never require touching anything else.
//
// Request/response shapes verified against Resend's public docs
// (https://resend.com/docs/api-reference/emails/send-email and
// https://resend.com/docs/api-reference/errors) at the time this was
// written — not invented. No live account/credentials were available in
// this slice to run a real round-trip against; see ROADMAP.md for the
// documented manual activation step.
import type {
  EmailAddress,
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "@/lib/email/email-provider";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Status codes Resend documents as quota/rate-limit or server-side —
 * conditions where the same request, retried later with the same
 * Idempotency-Key, has a real chance of succeeding. Everything else (400
 * validation, 401/403 auth/domain, 404/405/422/451) is a property of this
 * specific request or this account's configuration and won't change on
 * retry, so it's treated as permanent. */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function buildRequestBody(message: EmailMessage): Record<string, unknown> {
  return {
    from: formatAddress(message.from),
    to: [formatAddress(message.to)],
    ...(message.replyTo ? { reply_to: [formatAddress(message.replyTo)] } : {}),
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.headers && Object.keys(message.headers).length > 0
      ? { headers: message.headers }
      : {}),
  };
}

type ResendSuccessBody = { id?: unknown };
type ResendErrorBody = { name?: unknown; message?: unknown; statusCode?: unknown };

/** `apiKey` is a constructor argument, not a `process.env` read inside this
 * module — same testability discipline as the rest of this codebase (see
 * followups.process.ts's isAuthorized for the precedent). The caller (the
 * worker route) is the only place that reads `EMAIL_PROVIDER_API_KEY`. */
export function createResendEmailProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(message: EmailMessage): Promise<EmailSendResult> {
      let response: Response;
      try {
        response = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify(buildRequestBody(message)),
        });
      } catch (err) {
        // A network-layer failure (DNS, connection reset, fetch-level
        // timeout) — we genuinely don't know whether Resend ever received
        // the request. Always transient: this is exactly the crash window
        // the idempotency key exists to make a retry safe for (see
        // src/lib/followups/email-delivery-adapter.ts's doc comment).
        const detail = err instanceof Error ? err.message : String(err);
        return {
          outcome: "rejected",
          retryable: true,
          errorCode: `transient:network_error:${detail.slice(0, 120)}`,
        };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Non-JSON body — fall through, handled below by the ok/not-ok branches.
      }

      if (response.ok) {
        const id = (body as ResendSuccessBody | null)?.id;
        if (typeof id === "string" && id.length > 0) {
          return { outcome: "accepted", providerMessageId: id };
        }
        // A 2xx without a usable id isn't a documented Resend response
        // shape — don't silently report success without something to
        // store as provider_message_id; treat conservatively as a
        // permanent failure that needs a human/code look, not a retry.
        return {
          outcome: "rejected",
          retryable: false,
          errorCode: "permanent:accepted_without_id",
        };
      }

      const errorBody = body as ResendErrorBody | null;
      const errorName = typeof errorBody?.name === "string" ? errorBody.name : "unknown_error";
      const retryable = TRANSIENT_STATUS_CODES.has(response.status);
      const prefix = retryable ? "transient" : "permanent";
      return {
        outcome: "rejected",
        retryable,
        errorCode: `${prefix}:${response.status}:${errorName}`.slice(0, 150),
      };
    },
  };
}
