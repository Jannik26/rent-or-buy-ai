// Pure, unit-tested rules for the automated Lead Follow-ups engine (Product
// Track slice 5, see ROADMAP.md) — no Supabase I/O here (that lives in
// followups.functions.ts). Same split as
// src/lib/conversations/conversation-rules.ts and
// src/lib/appointments/appointment-rules.ts.
//
// Scope reminder (see ROADMAP.md for the full writeup): this module decides
// *whether/when* an automated follow-up should exist and be sent — it never
// delivers anything itself (see followups.functions.ts's delivery-adapter
// abstraction) and never talks to an external channel.

/** CLAUDE.md: "Maximal 3 Follow-up-Nachrichten... keine aggressive
 * Nachfasslogik." Enforced in three independent layers, not just here:
 * the DB CHECK on `conversation_followups.step` (1..3), the UNIQUE
 * constraint on `(conversation_id, step)`, and this constant everywhere
 * app code needs to reason about the limit. */
export const MAX_FOLLOWUP_STEPS = 3;
export type FollowupStep = 1 | 2 | 3;
export const FOLLOWUP_STEPS: readonly FollowupStep[] = [1, 2, 3];

export type FollowupStatus =
  | "scheduled"
  | "processing"
  | "sent"
  | "cancelled"
  | "failed"
  | "skipped";

/**
 * Cumulative hours from the triggering ("origin") AI turn to each step —
 * matches the product default (Follow-up 1 nach 24h, Follow-up 2 nach
 * weiteren 48h, Follow-up 3 nach weiteren 72h), expressed as absolute
 * offsets from the same origin point since all 3 steps are scheduled
 * upfront in one batch (see ensureFollowupsForConversation in
 * followups.functions.ts) rather than chained reactively off each other's
 * actual send time. Centralized here — the one place these values are
 * defined — no scattered magic numbers, no settings UI (CLAUDE.md: "Keine
 * unnötige Settings-UI").
 */
export const FOLLOWUP_STEP_OFFSET_HOURS: Record<FollowupStep, number> = {
  1: 24,
  2: 24 + 48, // 72
  3: 24 + 48 + 72, // 144
};

const HOUR_MS = 60 * 60 * 1000;

/** The scheduled_for timestamp for a given step, relative to the origin AI
 * turn's time — pure, no Date.now() inside, fully deterministic and
 * testable. */
export function computeScheduledFor(originAt: Date, step: FollowupStep): Date {
  return new Date(originAt.getTime() + FOLLOWUP_STEP_OFFSET_HOURS[step] * HOUR_MS);
}

/**
 * Deterministic, fixed templates — not a live LLM call (CLAUDE.md-aligned:
 * professionell, freundlich, nicht aggressiv, keine künstliche
 * Dringlichkeit; task instructions: no per-test Claude cost). Step 3 is
 * explicitly the last automated message — its own text says so, so the
 * lead isn't left wondering whether more will follow (there won't be any,
 * see MAX_FOLLOWUP_STEPS).
 */
const FOLLOWUP_TEMPLATES: Record<FollowupStep, string> = {
  1: "Hallo! Ich wollte kurz nachfragen, ob ich Ihnen bei Ihrem Anliegen noch weiterhelfen kann. Lassen Sie mich gerne wissen, falls Sie noch Fragen haben.",
  2: "Nur eine kurze Erinnerung: Falls Sie noch Unterstützung bei Ihrer Immobilienanfrage benötigen, bin ich weiterhin gerne für Sie da.",
  3: "Ich wollte mich ein letztes Mal melden. Falls sich Ihre Situation ändert oder neue Fragen aufkommen, erreichen Sie uns jederzeit gerne wieder.",
};

export function getFollowupTemplate(step: FollowupStep): string {
  return FOLLOWUP_TEMPLATES[step];
}

/** Why an automated follow-up sequence was never (re-)started, or a
 * scheduled step was cancelled/skipped instead of sent — always recorded
 * (see conversation_followups.skip_reason), never silently dropped. */
export type FollowupAbortReason =
  | "conversation_closed"
  | "lead_replied"
  | "sequence_already_exists";

/**
 * Should a brand-new follow-up sequence be scheduled for this conversation
 * right now? Called right after a real AI turn (see
 * ensureFollowupsForConversation). `existingFollowupCount` is the total
 * number of follow-up rows this conversation has EVER had, in any status —
 * the lifetime cap (see MAX_FOLLOWUP_STEPS / the migration header): once a
 * sequence has been scheduled once, a new episode of lead silence later in
 * the same conversation does NOT get a fresh set of 3 — this is the
 * deliberately conservative reading of "keine aggressive Nachfasslogik",
 * documented in ROADMAP.md, not an oversight.
 */
export function shouldScheduleSequence(input: {
  conversationStatus: string;
  existingFollowupCount: number;
}): { schedule: boolean; reason?: FollowupAbortReason } {
  if (input.conversationStatus === "closed") {
    return { schedule: false, reason: "conversation_closed" };
  }
  if (input.existingFollowupCount > 0) {
    return { schedule: false, reason: "sequence_already_exists" };
  }
  return { schedule: true };
}

/**
 * Re-checked by the worker immediately before actually sending a claimed,
 * due row — "Regeln erneut prüfen" (task instructions), not just trusting
 * whatever was true at scheduling time. `hasLeadReplySinceOrigin` is
 * precomputed by the caller (see followups.functions.ts) from
 * `after_sequence` — this function itself stays pure/DB-free.
 */
export function shouldSendFollowup(input: {
  conversationStatus: string;
  hasLeadReplySinceOrigin: boolean;
}): { send: boolean; reason?: FollowupAbortReason } {
  if (input.conversationStatus === "closed") {
    return { send: false, reason: "conversation_closed" };
  }
  if (input.hasLeadReplySinceOrigin) {
    return { send: false, reason: "lead_replied" };
  }
  return { send: true };
}
