// DB-touching webhook processing (Product Track slice 8A, see ROADMAP.md)
// — kept separate from the route handler (src/routes/api/internal/
// email.resend.webhook.ts, deliberately thin) and from the pure parsing in
// webhook-events.ts, same three-layer split this codebase already uses
// for the worker (route → *.functions.ts → *-rules.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addSuppression } from "@/lib/email/suppression";
import {
  mapEventTypeToDeliveryStatus,
  type ParsedResendWebhookEvent,
} from "@/lib/email/webhook-events";

const UNIQUE_VIOLATION = "23505";

/**
 * Resend documents at-least-once webhook delivery — this is the dedup
 * gate every event must pass through before anything else happens.
 * `eventId` is Svix's own `svix-id` (already verified as the delivery
 * that produced a valid signature, see webhook-verification.ts). A
 * primary-key conflict is treated as "already processed", not an error —
 * the caller acks the request either way (Resend must never see a
 * duplicate-event 4xx/5xx, or it will keep retrying something that
 * already succeeded).
 */
export async function recordWebhookEvent(
  client: SupabaseClient<Database>,
  args: { eventId: string; eventType: string },
): Promise<{ isDuplicate: boolean }> {
  const { error } = await client
    .from("email_webhook_events")
    .insert({ id: args.eventId, event_type: args.eventType });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { isDuplicate: true };
    throw new Error(error.message);
  }
  return { isDuplicate: false };
}

export type ApplyWebhookEventResult = {
  matched: boolean;
  deliveryStatus: string | null;
  suppressed: boolean;
};

/**
 * Only called once per genuinely-new event (the caller already gated on
 * recordWebhookEvent's dedup check) — this function itself doesn't need to
 * be idempotent against being called twice for the same event, but every
 * individual write it performs still is, defense in depth:
 *   - the conversation_followups UPDATE is a plain field overwrite (safe
 *     to repeat with the same values)
 *   - addSuppression upserts on the (company_id, email) unique constraint
 *     (see suppression.ts) — repeating never creates a duplicate row
 */
export async function applyResendWebhookEvent(
  client: SupabaseClient<Database>,
  event: ParsedResendWebhookEvent,
  now: Date,
): Promise<ApplyWebhookEventResult> {
  const deliveryStatus = mapEventTypeToDeliveryStatus(event.type);

  if (!event.emailId) {
    return { matched: false, deliveryStatus, suppressed: false };
  }

  // provider_message_id was set by the worker at send time (slice 7) —
  // this is the only correlation this handler ever trusts; company_id
  // comes from OUR row, never from the webhook payload itself, so a
  // malicious/malformed webhook body can never attribute an event to the
  // wrong tenant.
  const { data: row, error } = await client
    .from("conversation_followups")
    .select("id, company_id")
    .eq("provider_message_id", event.emailId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    return { matched: false, deliveryStatus, suppressed: false };
  }

  if (deliveryStatus) {
    const { error: updateError } = await client
      .from("conversation_followups")
      .update({
        delivery_status: deliveryStatus,
        delivery_status_updated_at: now.toISOString(),
        bounce_type: deliveryStatus === "bounced" ? event.bounceType : null,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
  }

  let suppressed = false;
  const recipientEmail = event.recipients[0] ?? null;
  if (recipientEmail) {
    // Task Phase C7: only a clearly-justified (hard/permanent) bounce
    // suppresses immediately — a soft/transient bounce is recorded on the
    // row (above) but doesn't stop future sends on its own.
    if (deliveryStatus === "bounced" && event.bounceType === "hard") {
      await addSuppression(client, {
        companyId: row.company_id,
        email: recipientEmail,
        reason: "bounce",
      });
      suppressed = true;
    } else if (deliveryStatus === "complained") {
      // Task Phase C8: a complaint always suppresses, no exceptions, never
      // auto-removed.
      await addSuppression(client, {
        companyId: row.company_id,
        email: recipientEmail,
        reason: "complaint",
      });
      suppressed = true;
    }
  }

  return { matched: true, deliveryStatus, suppressed };
}
