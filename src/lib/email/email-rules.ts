// Pure, unit-tested rules for the E-Mail delivery channel (Product Track
// slice 7, see ROADMAP.md) — no Supabase I/O, no fetch, no process.env
// reads here (same split as src/lib/followups/followup-rules.ts). Recipient
// resolution, sender identity, subject/body rendering, and config parsing
// all live here so they're testable without mocking the DB or the network.

import { z } from "zod";
import { getFollowupTemplate, type FollowupStep } from "@/lib/followups/followup-rules";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

// ============================================================================
// Recipient resolution (task Phase 7) — the recipient must come from the
// server-resolved lead record, never from request input; this module only
// decides whether a given (already server-resolved) address is usable, it
// never sources one.
// ============================================================================

const emailSchema = z.string().trim().email();

export type RecipientResolution =
  | { ok: true; email: string }
  | { ok: false; reason: "missing_email" | "invalid_email" };

/** A missing or syntactically implausible lead email is not a technical
 * failure (task Phase 7: "nicht failed, wenn dies fachlich kein technischer
 * Fehler ist") — callers turn a `{ok:false}` here into a `skipped` followup
 * with this `reason` as the machine-readable skip_reason, not into
 * `failed`. */
export function resolveRecipientEmail(rawEmail: string | null | undefined): RecipientResolution {
  const trimmed = (rawEmail ?? "").trim();
  if (!trimmed) return { ok: false, reason: "missing_email" };
  const parsed = emailSchema.safeParse(trimmed);
  if (!parsed.success) return { ok: false, reason: "invalid_email" };
  return { ok: true, email: parsed.data };
}

// ============================================================================
// Header-injection safety (task Phase 28) — every value that ends up in an
// email header (display name, subject) is sanitized here first, regardless
// of whatever escaping the provider SDK/API also does — this codebase
// doesn't rely on a single layer for something security-relevant (see e.g.
// isSafeHttpUrl elsewhere in the repo for the same belt-and-suspenders
// pattern).
// ============================================================================

/** Strips CR/LF and other control characters that could otherwise be used
 * to inject additional headers or corrupt a header value if company data
 * (which owners control themselves, but which is still untrusted for this
 * purpose) ever reached a raw header unescaped. */
export function sanitizeHeaderValue(raw: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars for header-injection safety
  return raw.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
}

const FALLBACK_COMPANY_NAME = "Ihr Immobilienberater";

function safeCompanyName(companyName: string): string {
  return sanitizeHeaderValue(companyName) || FALLBACK_COMPANY_NAME;
}

// ============================================================================
// Sender identity (task Phase 8) — envelope/provider "From" is always the
// centrally verified EstateAI address (config, never per-company); only the
// *display name* varies per company. Reply-To also comes from config (see
// ROADMAP.md for why: no inbound processing exists yet in this slice, a
// human-monitored central inbox is the honest choice until a future slice
// builds real inbound routing — task Phase 19/20).
// ============================================================================

export type EmailSenderConfig = {
  fromAddress: string;
  replyToAddress: string;
};

export type ResolvedSenderIdentity = {
  from: { email: string; name: string };
  replyTo: { email: string };
};

/** Extension point for task Phase 20 (multi-tenant sender future): the
 * *shape* returned here (from/replyTo) is what a future per-company
 * override would still need to produce — only this function's internal
 * resolution would change (e.g. reading a verified companies.reply_to_email
 * column instead of always falling back to config), not its callers. No
 * such column exists yet — not built until actually needed. */
export function resolveSenderIdentity(
  companyName: string,
  config: EmailSenderConfig,
): ResolvedSenderIdentity {
  const name = safeCompanyName(companyName);
  return {
    from: { email: config.fromAddress, name: `${name} · automatisierter Assistent` },
    replyTo: { email: config.replyToAddress },
  };
}

// ============================================================================
// Subject (task Phase 9) — deterministic, no LLM call, no unnecessary
// sensitive lead data (only the company name).
// ============================================================================

const SUBJECT_TEMPLATES: Record<FollowupStep, (companyName: string) => string> = {
  1: (c) => `Kurze Rückfrage zu Ihrer Anfrage bei ${c}`,
  2: (c) => `Erinnerung: Ihre Anfrage bei ${c}`,
  3: (c) => `Letzte Nachricht zu Ihrer Anfrage bei ${c}`,
};

export function generateSubject(step: FollowupStep, companyName: string): string {
  return SUBJECT_TEMPLATES[step](safeCompanyName(companyName));
}

// ============================================================================
// Body rendering (task Phase 9-11) — plain text is the primary, robust
// version (Phase 10); HTML is a simple, single-column, responsive wrapper
// around the *exact same* deterministic follow-up text
// (getFollowupTemplate) the canonical in-app message already uses (task
// Phase 5's canonical-message invariant: the stored canonical message
// content must stay byte-identical to what slice 5 defined — the extra
// greeting/signature/transparency footer here is email-presentation only,
// never written to `messages.content`). AI-transparency (task Phase 11) is
// a visible footer line, not buried in fine print, and not overloading the
// main message with disclaimers.
// ============================================================================

function transparencyNote(companyName: string): string {
  return `Diese Nachricht wurde automatisiert von EstateAI im Auftrag von ${companyName} gesendet.`;
}

/** A reply reaches a real, human-monitored inbox (the configured
 * Reply-To) even though nothing automatically processes it into the
 * conversation yet — accurate, not misleading. Distinct from the real
 * unsubscribe link below (task Phase C10, slice 8A) — replying talks to a
 * human; the link stops automated follow-ups specifically and
 * immediately, no human needed. */
const REPLY_HINT =
  "Für Rückfragen antworten Sie einfach auf diese E-Mail — wir melden uns persönlich.";

function unsubscribeLine(unsubscribeUrl: string): string {
  return `Automatische Follow-up-E-Mails beenden: ${unsubscribeUrl}`;
}

export function renderPlainTextBody(
  step: FollowupStep,
  companyName: string,
  unsubscribeUrl: string,
): string {
  const name = safeCompanyName(companyName);
  return [
    getFollowupTemplate(step),
    "",
    "Mit freundlichen Grüßen",
    name,
    "",
    "---",
    transparencyNote(name),
    REPLY_HINT,
    unsubscribeLine(unsubscribeUrl),
  ].join("\n");
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHtmlBody(
  step: FollowupStep,
  companyName: string,
  unsubscribeUrl: string,
): string {
  const name = safeCompanyName(companyName);
  const body = escapeHtml(getFollowupTemplate(step));
  const companyHtml = escapeHtml(name);
  const transparencyHtml = escapeHtml(transparencyNote(name));
  const replyHintHtml = escapeHtml(REPLY_HINT);
  const unsubscribeHtml = escapeHtml(unsubscribeUrl);
  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0B1F3A;">
            <tr>
              <td style="font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${body}</p>
                <p style="margin:0 0 4px;">Mit freundlichen Grüßen</p>
                <p style="margin:0 0 24px;font-weight:600;">${companyHtml}</p>
                <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
                <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${transparencyHtml}</p>
                <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${replyHintHtml}</p>
                <p style="margin:0;font-size:12px;color:#6b7280;">Automatische Follow-up-E-Mails beenden: <a href="${unsubscribeHtml}" style="color:#6b7280;">${unsubscribeHtml}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** RFC 8058 one-click unsubscribe headers — the plain URL (angle-bracket
 * wrapped, per the List-Unsubscribe header's own RFC 2369 syntax) plus the
 * `List-Unsubscribe-Post` marker that tells a supporting mail client it can
 * POST to that same URL without opening the email. Same underlying
 * endpoint the visible footer link points to — see
 * src/routes/api/public/email.unsubscribe.ts, which treats a POST there as
 * pre-authorized (the mail client's own UI already got explicit user
 * consent) and a GET as "show a confirmation page first". */
export function buildListUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Builds the absolute, publicly-reachable unsubscribe URL for one
 * recipient — signs a fresh token from (companyId, email) each time
 * (cheap, deterministic, no lookup needed) rather than reading a
 * previously-stored one. `appBaseUrl` has no trailing slash (see
 * resolveEmailProviderConfig, which strips it). */
export function buildUnsubscribeUrl(args: {
  appBaseUrl: string;
  companyId: string;
  email: string;
  secret: string;
}): string {
  const token = signUnsubscribeToken({ companyId: args.companyId, email: args.email }, args.secret);
  return `${args.appBaseUrl}/api/public/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ============================================================================
// Config parsing (task Phase 14/15) — pure: takes raw env-var strings as
// arguments, never reads process.env itself (same pattern as
// followup-rules.ts's parsePositiveIntEnv). The actual process.env reads
// happen exactly once, in the worker entry point route.
// ============================================================================

const ENABLING_VALUES = new Set(["true", "1", "yes", "on"]);

/** Default is DISABLED, unlike FOLLOWUP_WORKER_ENABLED's default-enabled
 * kill switch — deliberately the opposite default, because sending a real
 * external email is the highest-risk action in this whole slice (task
 * Phase 15: "Default sicher wählen"). An unset or unrecognized value never
 * turns real sending on. */
export function isEmailDeliveryEnabled(rawFlag: string | undefined): boolean {
  if (!rawFlag) return false;
  return ENABLING_VALUES.has(rawFlag.trim().toLowerCase());
}

export type EmailProviderConfig = {
  apiKey: string;
  senderAddress: string;
  replyToAddress: string;
  appBaseUrl: string;
  unsubscribeSecret: string;
};

/** Returns null (not configured) unless every required piece is present and
 * the sender address is at least syntactically a valid email — the worker
 * route treats null as "fall back to the existing canonicalMessageDeliveryAdapter",
 * never as an error (task Phase 3: no invented credentials, no pretending a
 * verified domain exists when it doesn't). `replyToAddress` falls back to
 * `senderAddress` if not separately configured.
 *
 * `appBaseUrl`/`unsubscribeSecret` (added slice 8A) are required too, not
 * optional-with-a-fallback: an unsubscribe link is not optional
 * functionality once real email sending is on (task Phase C10) — a
 * deployment that hasn't set these yet stays on the safe canonical
 * fallback exactly like one missing the provider key, rather than ever
 * sending a real email with no way to opt out. */
export function resolveEmailProviderConfig(env: {
  apiKey: string | undefined;
  senderAddress: string | undefined;
  replyToAddress: string | undefined;
  appBaseUrl: string | undefined;
  unsubscribeSecret: string | undefined;
}): EmailProviderConfig | null {
  const apiKey = env.apiKey?.trim();
  const senderAddressRaw = env.senderAddress?.trim();
  const appBaseUrl = env.appBaseUrl?.trim();
  const unsubscribeSecret = env.unsubscribeSecret?.trim();
  if (!apiKey || !senderAddressRaw || !appBaseUrl || !unsubscribeSecret) return null;
  const senderCheck = emailSchema.safeParse(senderAddressRaw);
  if (!senderCheck.success) return null;
  const replyToRaw = env.replyToAddress?.trim();
  const replyToCheck = replyToRaw ? emailSchema.safeParse(replyToRaw) : undefined;
  const replyToAddress = replyToCheck?.success ? replyToCheck.data : senderCheck.data;
  return {
    apiKey,
    senderAddress: senderCheck.data,
    replyToAddress,
    appBaseUrl: appBaseUrl.replace(/\/+$/, ""),
    unsubscribeSecret,
  };
}
