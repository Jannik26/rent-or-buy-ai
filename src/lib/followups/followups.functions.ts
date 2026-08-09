// Central Automated Lead Follow-ups data layer (Product Track slice 5, see
// ROADMAP.md). Same two-privilege-level split as
// src/lib/conversations/conversations.functions.ts:
//   - getFollowupsForLead / cancelFollowupsForLead are createServerFn +
//     requireSupabaseAuth (RLS-enforced, NOT service role) — the only way
//     the dashboard reads/cancels follow-ups.
//   - ensureFollowupsForConversation / cancelOpenFollowupsOnLeadReply /
//     handleFollowupsAfterMessages / processDueFollowups are plain
//     functions taking a client parameter, deliberately not importing
//     supabaseAdmin themselves (this file ships to the client bundle, see
//     conversations.functions.ts's header for the full explanation).
//     widget.chat.ts calls handleFollowupsAfterMessages with its own
//     supabaseAdmin client; a future scheduler would call
//     processDueFollowups the same way (see the "not yet wired to an
//     automatic scheduler" note in ROADMAP.md — no pg_cron/edge function
//     exists in this project yet, so nothing invokes this on a timer today
//     — it is called directly by tests and is ready to be invoked by one).
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { appendMessages } from "@/lib/conversations/conversations.functions";
import type { MessageSenderType } from "@/lib/conversations/conversation-rules";
import {
  DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE,
  DEFAULT_STALE_PROCESSING_MINUTES,
  FOLLOWUP_STEPS,
  computeScheduledFor,
  decideRetry,
  getFollowupTemplate,
  isStaleProcessing,
  shouldScheduleSequence,
  shouldSendFollowup,
  type FollowupStatus,
  type FollowupStep,
} from "@/lib/followups/followup-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FollowupRow = {
  id: string;
  conversationId: string;
  step: FollowupStep;
  status: FollowupStatus;
  scheduledFor: string;
  sentAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  skipReason: string | null;
};

function toFollowupRow(row: {
  id: string;
  conversation_id: string;
  step: number;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  skip_reason: string | null;
}): FollowupRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    step: row.step as FollowupStep,
    status: row.status as FollowupStatus,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    cancelledAt: row.cancelled_at,
    failedAt: row.failed_at,
    skipReason: row.skip_reason,
  };
}

// ============================================================================
// Reads/cancel — authenticated, RLS-bound, dashboard-facing.
// ============================================================================

/** All follow-up steps (any status) for a lead's website conversation, step
 * ascending — the UI shows "which step, when, what status" (task section
 * 15), nothing more. No conversation → empty array, not an error (mirrors
 * getConversationDetail's shape for a lead with no chat history yet). */
export const getFollowupsForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }): Promise<FollowupRow[]> => {
    const { supabase } = context;
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", data.leadId)
      .eq("channel", "website")
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) return [];

    const { data: rows, error } = await supabase
      .from("conversation_followups")
      .select(
        "id, conversation_id, step, status, scheduled_for, sent_at, cancelled_at, failed_at, skip_reason",
      )
      .eq("conversation_id", conversation.id)
      .order("step", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toFollowupRow);
  });

/** "Follow-ups stoppen" (task section 15) — cancels every currently
 * `scheduled` row for the lead's conversation. Owner-authorization is RLS
 * itself (the UPDATE policy only matches the caller's own tenant); a
 * foreign leadId simply updates 0 rows, same no-op-for-foreign-data
 * pattern as the rest of this codebase. Rows already `sent`/`cancelled`/
 * `failed`/`skipped` are untouched — this only ever cancels what's still
 * pending. */
export const cancelFollowupsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }): Promise<{ cancelledCount: number }> => {
    const { supabase } = context;
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", data.leadId)
      .eq("channel", "website")
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) return { cancelledCount: 0 };

    const { data: cancelled, error } = await supabase
      .from("conversation_followups")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        skip_reason: "owner_stopped",
      })
      .eq("conversation_id", conversation.id)
      .eq("status", "scheduled")
      .select("id");
    if (error) throw new Error(error.message);
    return { cancelledCount: cancelled?.length ?? 0 };
  });

// ============================================================================
// Writes/scheduling — plain functions, client passed in by the caller.
// ============================================================================

/** Cancels every currently `scheduled` follow-up for a conversation — the
 * lead replying invalidates whatever was pending (task section 8). Same
 * update shape as cancelFollowupsForLead's owner-triggered cancel, just a
 * different skip_reason and no RLS involved (service-role caller). A
 * no-op if nothing is scheduled. */
export async function cancelOpenFollowupsOnLeadReply(
  client: SupabaseClient<Database>,
  args: { conversationId: string },
): Promise<void> {
  const { error } = await client
    .from("conversation_followups")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      skip_reason: "lead_replied",
    })
    .eq("conversation_id", args.conversationId)
    .eq("status", "scheduled");
  if (error) throw new Error(error.message);
}

/**
 * Schedules the full 1-3 step sequence for a conversation, all at once, IF
 * none has ever been scheduled for it yet (see shouldScheduleSequence's
 * doc comment — a lifetime cap, not a per-episode one) and the
 * conversation is still open. Idempotent: calling this again for a
 * conversation that already has follow-up rows is a safe no-op, not an
 * error and not a duplicate insert (also structurally impossible either
 * way — see the `(conversation_id, step)` unique constraint).
 */
export async function ensureFollowupsForConversation(
  client: SupabaseClient<Database>,
  args: { conversationId: string; companyId: string; originAt?: Date },
): Promise<void> {
  const originAt = args.originAt ?? new Date();

  const { data: conversation, error: convError } = await client
    .from("conversations")
    .select("status")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  if (!conversation) return; // conversation gone — nothing to schedule against

  const { count: existingFollowupCount, error: countError } = await client
    .from("conversation_followups")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", args.conversationId);
  if (countError) throw new Error(countError.message);

  const decision = shouldScheduleSequence({
    conversationStatus: conversation.status,
    existingFollowupCount: existingFollowupCount ?? 0,
  });
  if (!decision.schedule) return;

  const { data: lastMessage, error: seqError } = await client
    .from("messages")
    .select("sequence")
    .eq("conversation_id", args.conversationId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqError) throw new Error(seqError.message);
  const afterSequence = lastMessage?.sequence ?? -1;

  const rows = FOLLOWUP_STEPS.map((step) => ({
    conversation_id: args.conversationId,
    company_id: args.companyId,
    step,
    scheduled_for: computeScheduledFor(originAt, step).toISOString(),
    after_sequence: afterSequence,
  }));
  const { error: insertError } = await client.from("conversation_followups").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

/**
 * The single entry point widget.chat.ts calls after every canonical
 * message sync (see syncCanonicalConversation) — composes the two rules
 * above from what was actually just appended, so the two "when do
 * follow-ups start/stop" moments (task sections 8 and 16) can never
 * silently drift apart in two different call sites:
 *   - a new 'lead' message cancels any still-open follow-ups
 *   - a new 'ai' message (re-)ensures the sequence is scheduled if this is
 *     the conversation's first-ever eligible turn
 * Both can fire from the same call (the widget appends a 'lead' message
 * and the 'ai' reply together every turn) — cancel always runs before
 * ensure, so a fresh sequence is correctly evaluated against the
 * post-reply state, not stale pre-reply state.
 */
export async function handleFollowupsAfterMessages(
  client: SupabaseClient<Database>,
  args: {
    conversationId: string;
    companyId: string;
    appendedSenderTypes: MessageSenderType[];
    now?: Date;
  },
): Promise<void> {
  if (args.appendedSenderTypes.includes("lead")) {
    await cancelOpenFollowupsOnLeadReply(client, { conversationId: args.conversationId });
  }
  if (args.appendedSenderTypes.includes("ai")) {
    await ensureFollowupsForConversation(client, {
      conversationId: args.conversationId,
      companyId: args.companyId,
      originAt: args.now,
    });
  }
}

// ============================================================================
// Delivery abstraction (task section 11) — no external channel in this
// slice. See ROADMAP.md for how a future email/WhatsApp/phone adapter
// would slot in behind the same interface.
// ============================================================================

export type FollowupDeliveryInput = {
  /** The conversation_followups row's own id — a stable, already-persisted
   * value that channel adapters needing delivery idempotency (e.g. the
   * email adapter, see src/lib/followups/email-delivery-adapter.ts) can
   * reuse as a provider idempotency key. Unused by canonicalMessageDeliveryAdapter. */
  followupId: string;
  conversationId: string;
  companyId: string;
  step: FollowupStep;
  content: string;
};

/**
 * Three-way, not a boolean — Product Track slice 7 (see ROADMAP.md) added
 * the `skipped` outcome for "there was nothing to deliver to" (e.g. no lead
 * email on file), which task Phase 7 explicitly requires to be distinct
 * from a technical `failed`: it's not an error, it shouldn't have an
 * error_code, and — importantly — it should never look like something a
 * future retry mechanism ought to keep trying.
 * `messageId` on the delivered branch is nullable for one specific, narrow
 * case: an external send genuinely succeeded but the subsequent canonical
 * message write itself failed (see email-delivery-adapter.ts) — reporting
 * `delivered: false` there would risk a future retry re-sending an email
 * that already went out, which is strictly worse than a followup row
 * that's correctly `sent` with no linked canonical message.
 */
export type FollowupDeliveryResult =
  | { delivered: true; messageId: string | null; provider?: string; providerMessageId?: string }
  | { delivered: false; outcome: "skipped"; skipReason: string }
  | { delivered: false; outcome: "failed"; errorCode: string; retryable?: boolean };

export interface FollowupDeliveryAdapter {
  deliver(
    client: SupabaseClient<Database>,
    input: FollowupDeliveryInput,
  ): Promise<FollowupDeliveryResult>;
}

/**
 * The default adapter: "delivering" a follow-up means recording it as a
 * normal canonical `sender_type: 'ai'` message in the conversation (via the
 * one central appendMessages write path — task section 13, no second
 * message-write path). This is not a no-op stub that discards the content
 * — it's the same persistence a live AI reply already gets, visible to the
 * Makler in the dashboard. Still the adapter actually used whenever the
 * email adapter isn't configured/enabled (see
 * src/routes/api/internal/followups.process.ts) — the original slice-5/6
 * demo-safe behavior is unchanged unless an operator deliberately opts
 * into real email delivery.
 */
export const canonicalMessageDeliveryAdapter: FollowupDeliveryAdapter = {
  async deliver(client, input) {
    const inserted = await appendMessages(client, {
      conversationId: input.conversationId,
      companyId: input.companyId,
      messages: [{ senderType: "ai", content: input.content }],
    });
    const message = inserted[0];
    if (!message) {
      return { delivered: false, outcome: "failed", errorCode: "no_message_inserted" };
    }
    return { delivered: true, messageId: message.id, provider: "canonical" };
  },
};

// ============================================================================
// Worker (task section 10) — processDueFollowups(now). Not yet wired to an
// automatic scheduler (no pg_cron/edge function infra exists in this
// project — see ROADMAP.md); called directly by tests today, ready for a
// future scheduled invocation without any change to this function itself.
// ============================================================================

export type ProcessDueFollowupsResult = {
  claimed: number;
  sent: number;
  cancelled: number;
  failed: number;
  /** New in Product Track slice 7 (see ROADMAP.md) — a followup with no
   * valid delivery target (e.g. no lead email on file). Always 0 when using
   * canonicalMessageDeliveryAdapter, which never produces this outcome. */
  skipped: number;
  /** New in Product Track slice 8A — a transient delivery failure was
   * rescheduled for a bounded retry rather than immediately marked
   * `failed` (see decideRetry in followup-rules.ts). Always 0 for an
   * adapter that never sets `retryable` on a failure. */
  retried: number;
};

/**
 * Recovery for the "worker died between claim and final status" case (task
 * section 10): a `processing` row whose `updated_at` is older than
 * `staleAfterMinutes` was abandoned by a runtime that never reached a
 * terminal status — no automatic scheduler existed before this slice, so
 * this could previously only happen via a manual test run being killed
 * mid-flight, but it becomes a real operational concern once a scheduler
 * retries on a fixed interval.
 *
 * Never risks a double send: before touching a stale row, it checks
 * whether a matching canonical message (same conversation, the exact
 * deterministic template text for that step, at or after the sequence
 * this follow-up was scheduled against) already exists. If one does, the
 * row is reconciled to `sent` and backfilled with that message's id —
 * the delivery genuinely happened, only the bookkeeping update was lost.
 * If no such message exists, nothing was ever sent, so it's safe to
 * reset the row back to `scheduled` for a normal future claim (still
 * fully protected by processDueFollowups' own atomic claim — this does
 * not bypass that).
 */
export async function recoverStaleProcessingFollowups(
  client: SupabaseClient<Database>,
  args: { now?: Date; staleAfterMinutes?: number } = {},
): Promise<{ recovered: number; reconciledAsSent: number; resetToScheduled: number }> {
  const now = args.now ?? new Date();
  const staleAfterMinutes = args.staleAfterMinutes ?? DEFAULT_STALE_PROCESSING_MINUTES;

  const { data: processingRows, error: selectError } = await client
    .from("conversation_followups")
    .select("id, conversation_id, step, updated_at")
    .eq("status", "processing");
  if (selectError) throw new Error(selectError.message);

  const stale = (processingRows ?? []).filter((row) =>
    isStaleProcessing(new Date(row.updated_at), now, staleAfterMinutes),
  );

  const result = { recovered: 0, reconciledAsSent: 0, resetToScheduled: 0 };

  for (const row of stale) {
    // Re-check status='processing' in the WHERE clause of every write below
    // — the same "recheck at write time" discipline as the main claim
    // query, in case a normally-running worker finishes this exact row
    // between the SELECT above and here.
    const { data: matchingMessage, error: msgError } = await client
      .from("messages")
      .select("id")
      .eq("conversation_id", row.conversation_id)
      .eq("content", getFollowupTemplate(row.step as FollowupStep))
      .order("sequence", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (msgError) throw new Error(msgError.message);

    if (matchingMessage) {
      const { error } = await client
        .from("conversation_followups")
        .update({ status: "sent", sent_at: now.toISOString(), message_id: matchingMessage.id })
        .eq("id", row.id)
        .eq("status", "processing");
      if (error) throw new Error(error.message);
      result.reconciledAsSent += 1;
    } else {
      const { error } = await client
        .from("conversation_followups")
        .update({ status: "scheduled" })
        .eq("id", row.id)
        .eq("status", "processing");
      if (error) throw new Error(error.message);
      result.resetToScheduled += 1;
    }
    result.recovered += 1;
  }

  return result;
}

/**
 * Race-safe by construction, not by convention: claiming happens in two
 * steps — an ordinary SELECT to pick the oldest-due candidates up to
 * `batchSize` (see the task's batch-limit requirement; Postgres UPDATE has
 * no LIMIT clause, so a plain single-statement claim can't be capped), then
 * an `UPDATE ... WHERE status = 'scheduled' AND id IN (candidates)
 * RETURNING *`. The UPDATE's own `status = 'scheduled'` condition — not the
 * SELECT — is what actually prevents double-claiming: under ordinary
 * Postgres row-level UPDATE semantics, at most one concurrent call ever
 * moves a given row out of 'scheduled' (a second transaction hitting the
 * same row blocks on the row lock, then re-evaluates `status = 'scheduled'`
 * against the now-committed row once unblocked and correctly excludes it).
 * A second concurrent/duplicate invocation naturally claims zero rows for
 * anything already claimed, no advisory locks needed (see the migration
 * header). Every claimed row is then processed independently (its own
 * try/catch) so one row's failure never blocks the rest.
 */
export async function processDueFollowups(
  client: SupabaseClient<Database>,
  args: { now?: Date; adapter?: FollowupDeliveryAdapter; batchSize?: number } = {},
): Promise<ProcessDueFollowupsResult> {
  const now = args.now ?? new Date();
  const adapter = args.adapter ?? canonicalMessageDeliveryAdapter;
  const batchSize = args.batchSize ?? DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE;

  // Due = scheduled_for <= now, UNLESS a retry is pending (next_attempt_at
  // set — slice 8A), in which case that gates the row instead. A row with
  // no retry pending (next_attempt_at is null) behaves exactly as before.
  const nowIso = now.toISOString();
  const { data: candidates, error: candidatesError } = await client
    .from("conversation_followups")
    .select("id")
    .eq("status", "scheduled")
    .or(`and(next_attempt_at.is.null,scheduled_for.lte.${nowIso}),next_attempt_at.lte.${nowIso}`)
    .order("scheduled_for", { ascending: true })
    .limit(batchSize);
  if (candidatesError) throw new Error(candidatesError.message);

  const result: ProcessDueFollowupsResult = {
    claimed: 0,
    sent: 0,
    cancelled: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
  };
  if (!candidates || candidates.length === 0) return result;

  const { data: claimed, error: claimError } = await client
    .from("conversation_followups")
    .update({ status: "processing" })
    .eq("status", "scheduled")
    .in(
      "id",
      candidates.map((c) => c.id),
    )
    .select("id, conversation_id, company_id, step, after_sequence, attempt_count");
  if (claimError) throw new Error(claimError.message);

  result.claimed = claimed?.length ?? 0;

  for (const row of claimed ?? []) {
    try {
      const { data: conversation, error: convError } = await client
        .from("conversations")
        .select("status")
        .eq("id", row.conversation_id)
        .maybeSingle();
      if (convError) throw new Error(convError.message);

      const { count: laterLeadMessages, error: msgError } = await client
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", row.conversation_id)
        .eq("sender_type", "lead")
        .gt("sequence", row.after_sequence);
      if (msgError) throw new Error(msgError.message);

      const decision = shouldSendFollowup({
        conversationStatus: conversation?.status ?? "closed",
        hasLeadReplySinceOrigin: (laterLeadMessages ?? 0) > 0,
      });

      if (!decision.send) {
        const { error: cancelError } = await client
          .from("conversation_followups")
          .update({
            status: "cancelled",
            cancelled_at: now.toISOString(),
            skip_reason: decision.reason,
          })
          .eq("id", row.id);
        if (cancelError) throw new Error(cancelError.message);
        result.cancelled += 1;
        continue;
      }

      const delivery = await adapter.deliver(client, {
        followupId: row.id,
        conversationId: row.conversation_id,
        companyId: row.company_id,
        step: row.step as FollowupStep,
        content: getFollowupTemplate(row.step as FollowupStep),
      });

      if (delivery.delivered) {
        const { error: sentError } = await client
          .from("conversation_followups")
          .update({
            status: "sent",
            sent_at: now.toISOString(),
            message_id: delivery.messageId,
            delivery_provider: delivery.provider ?? null,
            provider_message_id: delivery.providerMessageId ?? null,
            // "accepted" = the provider took responsibility for the
            // message — not proof of inbox delivery. Webhooks (slice 8A)
            // may later move this to delivered/bounced/complained/
            // deferred. Only set when there's an actual external
            // provider_message_id to correlate a later webhook against;
            // the canonical-only adapter never gets a delivery_status.
            delivery_status: delivery.providerMessageId ? "accepted" : null,
            delivery_status_updated_at: delivery.providerMessageId ? now.toISOString() : null,
          })
          .eq("id", row.id);
        if (sentError) throw new Error(sentError.message);
        result.sent += 1;
      } else if (delivery.outcome === "skipped") {
        const { error: skipError } = await client
          .from("conversation_followups")
          .update({
            status: "skipped",
            skipped_at: now.toISOString(),
            skip_reason: delivery.skipReason,
          })
          .eq("id", row.id);
        if (skipError) throw new Error(skipError.message);
        result.skipped += 1;
      } else {
        // delivery.outcome === "failed" — retry only if the adapter
        // explicitly marked this attempt retryable (task Phase C13: never
        // retry a permanent rejection/suppression/invalid-recipient).
        const attemptCountAfterFailure = row.attempt_count + 1;
        const retryDecision = delivery.retryable
          ? decideRetry({ attemptCountAfterFailure, now })
          : { outcome: "exhausted" as const };

        if (retryDecision.outcome === "retry") {
          const { error: retryError } = await client
            .from("conversation_followups")
            .update({
              status: "scheduled",
              attempt_count: attemptCountAfterFailure,
              next_attempt_at: retryDecision.nextAttemptAt.toISOString(),
              error_code: delivery.errorCode,
            })
            .eq("id", row.id);
          if (retryError) throw new Error(retryError.message);
          result.retried += 1;
        } else {
          const errorCode = delivery.retryable
            ? `retry_exhausted:${delivery.errorCode}`.slice(0, 200)
            : delivery.errorCode;
          const { error: failError } = await client
            .from("conversation_followups")
            .update({
              status: "failed",
              failed_at: now.toISOString(),
              attempt_count: attemptCountAfterFailure,
              error_code: errorCode,
            })
            .eq("id", row.id);
          if (failError) throw new Error(failError.message);
          result.failed += 1;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client
        .from("conversation_followups")
        .update({
          status: "failed",
          failed_at: now.toISOString(),
          error_code: message.slice(0, 200),
        })
        .eq("id", row.id);
      result.failed += 1;
    }
  }

  return result;
}
