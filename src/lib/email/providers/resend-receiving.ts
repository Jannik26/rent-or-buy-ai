// Resend "Receiving API" client (Product Track slice 8B, see ROADMAP.md)
// — the inbound counterpart to providers/resend-provider.ts. Resend's
// email.received webhook delivers metadata only (id, from, to, subject,
// attachment metadata) — the actual text/html body must be fetched
// separately via `GET /emails/receiving/{id}` (verified against Resend's
// current API reference, not assumed). Kept in its own file, not merged
// into resend-provider.ts, since it's a genuinely different API surface
// (reading a received email, not sending one) even though it's the same
// provider.
const RECEIVING_API_BASE = "https://api.resend.com/emails/receiving";

/** Same transient/permanent split as the outbound provider — a
 * request-level failure or a 5xx/429 is worth a retry by the caller, a
 * 404/4xx is not. */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  attachmentCount: number;
};

export type FetchReceivedEmailResult =
  | { ok: true; email: ReceivedEmail }
  | { ok: false; reason: "not_found" | "transient_error" | "permanent_error" };

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `apiKey` is a plain argument, not a `process.env` read — same
 * testability discipline as createResendEmailProvider. */
export async function fetchReceivedEmail(
  emailId: string,
  apiKey: string,
): Promise<FetchReceivedEmailResult> {
  let response: Response;
  try {
    response = await fetch(`${RECEIVING_API_BASE}/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return { ok: false, reason: "transient_error" };
  }

  if (response.status === 404) {
    return { ok: false, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, reason: TRANSIENT_STATUS_CODES.has(response.status) ? "transient_error" : "permanent_error" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "permanent_error" };
  }

  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "permanent_error" };
  }
  const obj = body as Record<string, unknown>;
  const id = asStringOrNull(obj.id);
  const from = asStringOrNull(obj.from);
  if (!id || !from) {
    // Not the documented shape — treat conservatively as a permanent
    // failure rather than guessing at missing required fields.
    return { ok: false, reason: "permanent_error" };
  }

  const to = Array.isArray(obj.to) ? obj.to.filter((entry): entry is string => typeof entry === "string") : [];
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    ok: true,
    email: {
      id,
      from,
      to,
      subject: asStringOrNull(obj.subject),
      text: asStringOrNull(obj.text),
      html: asStringOrNull(obj.html),
      messageId: asStringOrNull(obj.message_id),
      attachmentCount: attachments.length,
    },
  };
}
