// DB/external-API-touching inbound email processing (Product Track slice
// 8B, see ROADMAP.md) — the orchestration layer between the thin route
// (email.resend.inbound.ts) and the pure logic modules (inbound-webhook-
// events.ts, reply-token.ts, inbound-sender.ts, inbound-content.ts). Same
// three-layer split the codebase already uses for the worker and the
// outbound webhook (route → *.functions.ts → *-rules.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { appendMessages } from "@/lib/conversations/conversations.functions";
import { handleFollowupsAfterMessages } from "@/lib/followups/followups.functions";
import { extractReplyContent } from "@/lib/email/inbound-content";
import { resolveInboundConversation } from "@/lib/email/inbound-resolution";
import { verifySender } from "@/lib/email/inbound-sender";
import { extractReplyToken } from "@/lib/email/reply-token";
import { findReplyAddress, type ParsedInboundEmailEvent } from "@/lib/email/inbound-webhook-events";
import { fetchReceivedEmail } from "@/lib/email/providers/resend-receiving";

export type ProcessInboundEmailResult =
  | { outcome: "no_reply_token" }
  | { outcome: "invalid_token" }
  | { outcome: "conversation_not_found" }
  | { outcome: "lead_not_found" }
  | { outcome: "sender_mismatch"; reason: "no_lead_email_on_file" | "sender_mismatch" }
  | { outcome: "fetch_failed_transient" }
  | { outcome: "fetch_failed_permanent" }
  | { outcome: "empty_content" }
  | { outcome: "attachment_only_unsupported" }
  | { outcome: "message_created"; conversationId: string; messageId: string | null; reopened: boolean };

/**
 * The full inbound pipeline for one already-verified, already-deduplicated
 * `email.received` event (signature verification and dedup both happen in
 * the caller, before this runs — see email.resend.inbound.ts). Every step
 * below is a hard gate: nothing after a rejection runs, and none of them
 * ever trust `event.to`/`event.from` as authoritative for tenant
 * assignment — only the token's resolved conversation is (task Phase 4).
 */
export async function processInboundEmail(
  client: SupabaseClient<Database>,
  args: {
    event: ParsedInboundEmailEvent;
    inboundDomain: string;
    tokenSecret: string;
    resendApiKey: string;
    now?: Date;
  },
): Promise<ProcessInboundEmailResult> {
  const now = args.now ?? new Date();

  // ---- Phase 2/6: which recipient is actually our reply-routing address ----
  const replyAddress = findReplyAddress(args.event.to, args.inboundDomain);
  if (!replyAddress) return { outcome: "no_reply_token" };

  const token = extractReplyToken(replyAddress);
  if (!token) return { outcome: "no_reply_token" };

  // ---- Phase 4: server-side conversation resolution — the ONLY source of
  // truth for company_id/lead_id from here on. ----
  const resolved = await resolveInboundConversation(client, { token, secret: args.tokenSecret });
  if (!resolved.ok) {
    return { outcome: resolved.reason };
  }

  // ---- Phase 5: sender verification — a valid token alone doesn't grant
  // write access; the From address must match the lead's own email. ----
  const senderCheck = verifySender(args.event.from ?? "", resolved.conversation.leadEmail);
  if (!senderCheck.ok) {
    return { outcome: "sender_mismatch", reason: senderCheck.reason };
  }

  // ---- Phase 1/9: the webhook payload is metadata only — fetch the real
  // text/html body via the Receiving API. ----
  if (!args.event.emailId) {
    return { outcome: "fetch_failed_permanent" };
  }
  const fetchResult = await fetchReceivedEmail(args.event.emailId, args.resendApiKey);
  if (!fetchResult.ok) {
    return {
      outcome: fetchResult.reason === "transient_error" ? "fetch_failed_transient" : "fetch_failed_permanent",
    };
  }

  // ---- Phase 9/10/11: content extraction + quote trimming; reject empty
  // results rather than writing a blank canonical message. ----
  const extracted = extractReplyContent({ text: fetchResult.email.text, html: fetchResult.email.html });
  if (!extracted.ok) {
    // Phase 12: an attachment-only mail (no usable text at all) gets its
    // own distinct, honest outcome — never silently treated as "processed"
    // when the actual content (the attachment) was never looked at.
    return fetchResult.email.attachmentCount > 0
      ? { outcome: "attachment_only_unsupported" }
      : { outcome: "empty_content" };
  }

  // ---- Phase 8: canonical write — the same appendMessages path every
  // other channel uses, never a direct insert. sequence/company_id stay
  // server-side (appendMessages' own contract). ----
  const inserted = await appendMessages(client, {
    conversationId: resolved.conversation.conversationId,
    companyId: resolved.conversation.companyId,
    messages: [{ senderType: "lead", content: extracted.content }],
  });
  const messageId = inserted[0]?.id ?? null;

  // ---- Phase 14: a genuine lead reply reopens a closed conversation.
  // Investigated first (task instruction): no existing code path in this
  // codebase ever sets conversations.status='closed' today (grep across
  // src/lib/conversations/ and src/lib/followups/ turned up none), so this
  // doesn't collide with any existing closing workflow — safe to implement
  // directly rather than stopping for a separate decision. ----
  let reopened = false;
  if (resolved.conversation.conversationStatus === "closed") {
    const { error: reopenError } = await client
      .from("conversations")
      .update({ status: "open" })
      .eq("id", resolved.conversation.conversationId)
      .eq("status", "closed");
    if (reopenError) throw new Error(reopenError.message);
    reopened = true;
  }

  // ---- Phase 13/15: same business effect as any other canonical 'lead'
  // message — reuses the existing single composition point
  // (handleFollowupsAfterMessages), which cancels open follow-ups and does
  // NOT (re)schedule new ones for a 'lead'-only append. Suppression is
  // untouched here — outbound suppression and inbound acceptance are
  // different concepts (task Phase 15). ----
  await handleFollowupsAfterMessages(client, {
    conversationId: resolved.conversation.conversationId,
    companyId: resolved.conversation.companyId,
    appendedSenderTypes: ["lead"],
    now,
  });

  return {
    outcome: "message_created",
    conversationId: resolved.conversation.conversationId,
    messageId,
    reopened,
  };
}
