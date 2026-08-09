// Pure sender-verification rules for inbound email (Product Track slice
// 8B, see ROADMAP.md) — a valid reply token alone is not sufficient
// authorization (task Phase 5): the inbound `From` address must also
// match the lead's own email on file, or the message is rejected before
// it ever becomes a canonical message. No DB access here — the already-
// resolved `leadEmail` is passed in by the caller (inbound-resolution.ts).

/** Extracts the bare address from a `"Display Name" <addr@example.com>`
 * or plain `addr@example.com` From header value, then normalizes for
 * comparison (trim + lowercase — email local-parts are case-sensitive per
 * spec in theory, but no real mail provider treats them that way in
 * practice, and this codebase already normalizes emails the same way
 * elsewhere, see validate-email.ts's normalizeEmail).
 *
 * Uses the LAST `<...>` pair in the string, not the first: RFC 5322's
 * `addr-spec` always sits in the final angle-bracket pair before the end
 * of a mailbox value, so a display name that itself happens to contain a
 * literal `<` (e.g. `Max <3 Mustermann <max@example.com>`) still resolves
 * to the real address rather than to a truncated fragment of the display
 * name — matters here because this is a security comparison, not just
 * cosmetic parsing. */
export function normalizeEmailAddressForComparison(raw: string): string {
  const trimmedRaw = raw.trim();
  const lastOpen = trimmedRaw.lastIndexOf("<");
  const lastClose = trimmedRaw.lastIndexOf(">");
  const address =
    lastOpen !== -1 && lastClose !== -1 && lastClose > lastOpen
      ? trimmedRaw.slice(lastOpen + 1, lastClose)
      : trimmedRaw;
  return address.trim().toLowerCase();
}

export type SenderVerificationResult =
  | { ok: true }
  | { ok: false; reason: "no_lead_email_on_file" | "sender_mismatch" };

/** `leadEmail` being null (a lead with no email on file at all) is treated
 * as a mismatch, not a pass — there's nothing to verify against, so
 * accepting any sender would mean accepting an unverified source into the
 * conversation (task Phase 19: sender spoofing is an explicit threat to
 * model). */
export function verifySender(inboundFrom: string, leadEmail: string | null): SenderVerificationResult {
  if (!leadEmail) {
    return { ok: false, reason: "no_lead_email_on_file" };
  }
  const normalizedFrom = normalizeEmailAddressForComparison(inboundFrom);
  const normalizedLeadEmail = normalizeEmailAddressForComparison(leadEmail);
  if (normalizedFrom !== normalizedLeadEmail) {
    return { ok: false, reason: "sender_mismatch" };
  }
  return { ok: true };
}
