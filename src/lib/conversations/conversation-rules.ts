// Pure, unit-tested rules for the canonical Conversations/Messages domain —
// no Supabase I/O here (that lives in conversations.functions.ts). Same
// split as src/lib/appointments/appointment-rules.ts and
// src/lib/analytics/analytics-rules.ts.
//
// Conversations Foundation (see ROADMAP.md and the
// 20260808014256_add_canonical_conversations.sql migration): `public.
// messages` is a real, constrained table now — `sender_type`/`content` are
// NOT NULL with CHECK constraints, so (unlike the old `leads.messages`
// JSONB) a malformed row is structurally impossible, not just unlikely.
// The defensive "normalize anything, never throw" functions this file used
// to need for that JSONB blob are gone — there is nothing left to defend
// against once the database itself enforces the shape.

/** The four sender origins this domain distinguishes today — see the
 * migration header for why exactly these four and not more: 'lead' (the
 * interested visitor/contact), 'ai' (EstateAI's own generated reply),
 * 'agent' (a human Makler writing directly — not produced by any write
 * path yet, but a real, named future case), 'system' (a non-conversational
 * system entry, e.g. a future "conversation closed" marker). No
 * automation-specific origin yet (see ROADMAP.md's Follow-up-prep note). */
export type MessageSenderType = "lead" | "ai" | "agent" | "system";

export type CanonicalMessage = {
  senderType: MessageSenderType;
  content: string;
};

const DEFAULT_PREVIEW_LENGTH = 120;

/** Collapses whitespace and truncates for a list-row snippet. Never
 * fabricates text — an empty/whitespace-only message truncates to "". */
export function truncatePreview(text: string, maxLength: number = DEFAULT_PREVIEW_LENGTH): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

export type ConversationSummary = {
  leadId: string;
  /** `conversations.last_message_at` — a real column now (maintained by the
   * `tg_touch_conversation_on_message` trigger), not the `leads.updated_at`
   * approximation Conversations V1 used to rely on. For legacy/backfilled
   * conversations it was seeded from `leads.updated_at` once during the
   * migration (see the backfill migration header) — same value, same
   * meaning, just no longer computed ad hoc on every read. */
  activityAt: string | null;
};

/** Stable, descending sort by activity time — the single definition of
 * "neueste tatsächliche Conversation-Aktivität zuerst" so the server
 * function and any client-side re-sort can never disagree. A null/invalid/
 * unparseable timestamp sorts last rather than throwing or corrupting the
 * rest of the order. */
export function sortConversationsByActivity<T extends ConversationSummary>(list: T[]): T[] {
  const time = (iso: string | null) => {
    if (!iso) return -Infinity;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...list].sort((a, b) => time(b.activityAt) - time(a.activityAt));
}

/** Case-insensitive substring match on the lead's name — search is
 * intentionally scoped to name only for V1 (matches the requested "Suche
 * nach Lead/Kontakt"), not message content, which would need a very
 * different (and PII-heavier) query shape. A blank query matches
 * everything. */
export function matchesSearch(name: string | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (name ?? "").toLowerCase().includes(q);
}

export const CONVERSATION_STATUS_FILTERS = ["all", "neu", "qualifiziert", "termin"] as const;
export type ConversationStatusFilter = (typeof CONVERSATION_STATUS_FILTERS)[number];

export function matchesStatusFilter(status: string, filter: ConversationStatusFilter): boolean {
  return filter === "all" || status === filter;
}

export const CONVERSATION_SCORE_FILTERS = ["all", "hot", "warm", "cold"] as const;
export type ConversationScoreFilter = (typeof CONVERSATION_SCORE_FILTERS)[number];

export function matchesScoreFilter(score: string, filter: ConversationScoreFilter): boolean {
  return filter === "all" || score === filter;
}

// ---- Write-path helpers (used by widget.chat.ts via
// conversations.functions.ts's appendMessages/syncCanonicalConversation) ----

/** The only two roles the AI SDK transcript this app builds has ever
 * contained (verified against production, see the migration) — anything
 * else returns null so the caller can skip it rather than insert a row
 * that would fail messages.sender_type's CHECK constraint anyway. Not a
 * defensive "normalize anything" function like the old normalizeMessage:
 * a bad value here is a genuine "don't persist this", not a shape to
 * paper over. */
export function mapTranscriptRoleToSenderType(role: string): MessageSenderType | null {
  if (role === "user") return "lead";
  if (role === "assistant") return "ai";
  return null;
}

export type TranscriptTurn = { role: string; content: string };

/**
 * The widget resends the FULL conversation history on every turn (standard
 * AI SDK client behavior), not just the new message — so persisting
 * `transcript` as-is on every call would re-insert everything already
 * stored. Given how many canonical messages this conversation already has
 * (`alreadyPersistedCount`), this returns only the genuinely new tail —
 * normally exactly one new user turn plus the one new assistant reply this
 * server call just generated, but written generally (a plain slice) so it
 * also does the right thing if a caller ever legitimately catches up more
 * than one new turn at once. Never re-derives or guesses at existing
 * messages' content — it only ever looks at the count.
 */
export function computeNewTranscriptTurns(
  fullTranscript: TranscriptTurn[],
  alreadyPersistedCount: number,
): TranscriptTurn[] {
  const knownCount = Math.max(0, alreadyPersistedCount);
  if (knownCount >= fullTranscript.length) return [];
  return fullTranscript.slice(knownCount);
}
