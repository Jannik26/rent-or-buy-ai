// The E-Mail Delivery Adapter (Product Track slice 7, see ROADMAP.md) — the
// "Delivery Adapter" half of the required chain:
//   EstateAI Domain Logic → Delivery Adapter (this file) → Provider Adapter
//   (src/lib/email/providers/*) → externer E-Mail-Provider
// Implements the same FollowupDeliveryAdapter interface
// canonicalMessageDeliveryAdapter does (see followups.functions.ts) — the
// worker (processDueFollowups) never knows or cares which one it's calling.
//
// ---- Delivery ordering / crash-window analysis (task Phase 6/24) ----
//
// Order: PROVIDER SEND FIRST, canonical message write second (Variante B).
// This only works safely because every send carries `input.followupId` —
// the conversation_followups row's own already-persisted primary key — as
// the provider's idempotency key (Resend: Idempotency-Key header, 24h
// window; see resend-provider.ts). That single fact closes every crash
// window without a separate outbox/queue table:
//
//   - Crash before this function runs at all: the row is still
//     'processing' (or reset to 'scheduled' by stale-processing recovery,
//     see followups.functions.ts). No provider call ever happened — a
//     later retry calls the provider for the first time. Safe.
//   - Crash after provider.send() succeeds but before the canonical
//     message insert below (or before the caller's UPDATE persists
//     'sent'): the row is eventually recovered to 'scheduled' (no matching
//     canonical message exists yet — recoverStaleProcessingFollowups can't
//     find one) and re-claimed. This function runs again for the SAME
//     followupId, so the SAME idempotency key is sent to Resend again.
//     Resend recognizes the duplicate key within its 24h window and
//     returns the *original* response instead of sending a second real
//     email — we then proceed to (successfully, this time) write the
//     canonical message. No double send.
//   - Crash after the canonical message insert but before the caller's
//     final UPDATE: recoverStaleProcessingFollowups' existing
//     content-match reconciliation (unchanged from slice 6) finds that
//     message and marks the row 'sent' — also no double send.
//
// Explicitly NOT chosen: canonical-message-first (Variante A). Writing the
// canonical message before calling the provider would make a crash between
// those two steps look identical, to the existing recovery logic, to a
// genuinely delivered message (recovery matches on canonical message
// content, not on provider state) — silently reconciling a followup to
// 'sent' when the email was, in fact, never sent. That's a quieter, but
// real, correctness bug the provider-first ordering avoids entirely.
//
// ---- Why no separate outbox table (task Phase 23/24) ----
//
// conversation_followups is already, structurally, a 1-row-per-delivery-
// attempt table (UNIQUE(conversation_id, step), max 3 ever). Combined with
// the idempotency-key reuse above and the unchanged slice-6 stale-recovery
// mechanism, every crash window is closed without introducing a queue/
// outbox. A dedicated outbox table would only earn its complexity if a
// single followup could legitimately need *multiple* independent delivery
// attempts tracked concurrently (e.g. multi-channel fan-out) — not the
// case here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { appendMessages } from "@/lib/conversations/conversations.functions";
import type {
  FollowupDeliveryAdapter,
  FollowupDeliveryResult,
} from "@/lib/followups/followups.functions";
import {
  buildListUnsubscribeHeaders,
  buildUnsubscribeUrl,
  generateSubject,
  renderHtmlBody,
  renderPlainTextBody,
  resolveRecipientEmail,
  resolveSenderIdentity,
  type EmailSenderConfig,
} from "@/lib/email/email-rules";
import type { EmailProvider } from "@/lib/email/email-provider";
import { isSuppressed } from "@/lib/email/suppression";

export type CreateEmailDeliveryAdapterArgs = {
  provider: EmailProvider;
  senderConfig: EmailSenderConfig;
  /** Product Track slice 8A — needed to build a real, working unsubscribe
   * link in every outbound email (task Phase C10). Both required: no
   * default/invented value, matching resolveEmailProviderConfig's "all or
   * nothing" config check in the worker route. */
  appBaseUrl: string;
  unsubscribeSecret: string;
};

export function createEmailDeliveryAdapter(
  args: CreateEmailDeliveryAdapterArgs,
): FollowupDeliveryAdapter {
  const { provider, senderConfig, appBaseUrl, unsubscribeSecret } = args;

  return {
    async deliver(client: SupabaseClient<Database>, input): Promise<FollowupDeliveryResult> {
      // ---- Recipient/sender resolution (task Phase 7/28) — server-side
      // only. conversationId/companyId originate from the already-claimed
      // conversation_followups row, never from any caller-supplied
      // parameter; there is no request input to this whole worker path at
      // all (see followups.process.ts). ----
      const [{ data: conversation, error: convError }, { data: company, error: companyError }] =
        await Promise.all([
          client
            .from("conversations")
            .select("lead_id")
            .eq("id", input.conversationId)
            .maybeSingle(),
          client.from("companies").select("name").eq("id", input.companyId).maybeSingle(),
        ]);
      if (convError) throw new Error(convError.message);
      if (companyError) throw new Error(companyError.message);
      if (!conversation) {
        return { delivered: false, outcome: "skipped", skipReason: "conversation_not_found" };
      }

      const { data: lead, error: leadError } = await client
        .from("leads")
        .select("email")
        .eq("id", conversation.lead_id)
        .maybeSingle();
      if (leadError) throw new Error(leadError.message);

      const recipient = resolveRecipientEmail(lead?.email ?? null);
      if (!recipient.ok) {
        // Not a technical failure (task Phase 7) — a lead with no/invalid
        // email is a normal, expected state, not something the worker
        // should ever mark 'failed' or that observability should surface
        // as an error.
        return { delivered: false, outcome: "skipped", skipReason: recipient.reason };
      }

      // ---- Suppression check (task Phase C9) — before EVERY external
      // send, including retries (task Phase C17: re-checked on each
      // attempt, not just the first, so a bounce/complaint/unsubscribe
      // recorded between attempts stops the next one too). ----
      const suppressed = await isSuppressed(client, {
        companyId: input.companyId,
        email: recipient.email,
      });
      if (suppressed) {
        return { delivered: false, outcome: "skipped", skipReason: "recipient_suppressed" };
      }

      const companyName = company?.name ?? "";
      const identity = resolveSenderIdentity(companyName, senderConfig);
      const unsubscribeUrl = buildUnsubscribeUrl({
        appBaseUrl,
        companyId: input.companyId,
        email: recipient.email,
        secret: unsubscribeSecret,
      });

      const sendResult = await provider.send({
        to: { email: recipient.email },
        from: identity.from,
        replyTo: identity.replyTo,
        subject: generateSubject(input.step, companyName),
        text: renderPlainTextBody(input.step, companyName, unsubscribeUrl),
        html: renderHtmlBody(input.step, companyName, unsubscribeUrl),
        headers: buildListUnsubscribeHeaders(unsubscribeUrl),
        // The delivery idempotency key — see the module doc comment above.
        idempotencyKey: input.followupId,
      });

      if (sendResult.outcome === "rejected") {
        return {
          delivered: false,
          outcome: "failed",
          errorCode: sendResult.errorCode,
          retryable: sendResult.retryable,
        };
      }

      // Canonical message write happens AFTER a confirmed provider accept
      // — see the module doc comment for why this ordering matters. The
      // content written is `input.content` (the exact, unmodified
      // deterministic follow-up template from followup-rules.ts) — never
      // the email-specific subject/greeting/footer wrapper, preserving the
      // canonical-message invariant (task Phase 5) that
      // recoverStaleProcessingFollowups' content-match logic depends on.
      let canonicalMessageId: string | null = null;
      try {
        const inserted = await appendMessages(client, {
          conversationId: input.conversationId,
          companyId: input.companyId,
          messages: [{ senderType: "ai", content: input.content }],
        });
        canonicalMessageId = inserted[0]?.id ?? null;
      } catch {
        // The email genuinely went out (provider accepted it) — reporting
        // `delivered: false` here would risk a future retry re-sending an
        // already-delivered email. A followup that's correctly 'sent' with
        // no linked canonical message is the strictly safer outcome; see
        // the FollowupDeliveryResult doc comment in followups.functions.ts.
        canonicalMessageId = null;
      }

      return {
        delivered: true,
        messageId: canonicalMessageId,
        provider: provider.name,
        providerMessageId: sendResult.providerMessageId,
      };
    },
  };
}
