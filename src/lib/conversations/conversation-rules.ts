// Pure, unit-tested rules for Conversations V1 — no Supabase I/O here (that
// lives in conversations.functions.ts). Same split as
// src/lib/appointments/appointment-rules.ts and
// src/lib/analytics/analytics-rules.ts.
//
// Data-model reality this module works around (verified against real
// production rows, see ROADMAP.md): `leads.messages` is a JSONB array of
// exactly `{ role, content }` — there is NO per-message timestamp anywhere
// in this schema. Every "when was this said" question this module or its
// callers answer is therefore necessarily at lead granularity
// (`leads.updated_at`), never per-message — see getConversationActivityAt
// below for the one place that limitation is made explicit.

export type MessageRole = "user" | "assistant" | "unknown";

export type NormalizedMessage = {
  role: MessageRole;
  content: string;
};

/**
 * Turns one raw array element from `leads.messages` into a safe, typed
 * message. Never throws, never invents content — an element that isn't a
 * `{role, content}`-shaped object, has a non-string content, or an
 * unrecognized role degrades to the most honest neutral representation
 * (`role: "unknown"`, `content: ""`) instead of guessing. The two roles
 * this app has ever actually written are "user" and "assistant" (see
 * widget.chat.ts's transcript construction) — anything else is legacy/
 * malformed by definition, not a silent variant of one of those two.
 */
export function normalizeMessage(raw: unknown): NormalizedMessage {
  if (typeof raw !== "object" || raw === null) {
    return { role: "unknown", content: "" };
  }
  const r = raw as Record<string, unknown>;
  const role: MessageRole =
    r.role === "user" ? "user" : r.role === "assistant" ? "assistant" : "unknown";
  const content = typeof r.content === "string" ? r.content : "";
  return { role, content };
}

/** `leads.messages` as stored is `unknown` from the client's point of view
 * (JSONB, no DB-level shape guarantee) — this is the one place that gets
 * turned into a safe array. Non-array input (null, undefined, a malformed
 * legacy shape) becomes an empty conversation, never an error. */
export function normalizeMessages(raw: unknown): NormalizedMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeMessage);
}

/** Array order in `leads.messages` already IS chronological order — every
 * write path (widget.chat.ts's persistLeadFromTranscript) only ever
 * appends. This getter exists so callers never index `[length - 1]`
 * themselves and get it wrong on an empty array. */
export function getLastMessage(messages: NormalizedMessage[]): NormalizedMessage | null {
  return messages.length === 0 ? null : messages[messages.length - 1];
}

const DEFAULT_PREVIEW_LENGTH = 120;

/** Collapses whitespace and truncates for a list-row snippet. Never
 * fabricates text — an empty/whitespace-only message truncates to "". */
export function truncatePreview(text: string, maxLength: number = DEFAULT_PREVIEW_LENGTH): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

/**
 * The one available proxy for "when did this conversation last have
 * activity": `leads.updated_at`. Documented here, in one place, as an
 * approximation rather than a true last-message timestamp — messages
 * carry no timestamp of their own (see the module header), and
 * `updated_at` is also bumped by non-message writes to the same row
 * (status changes via the appointments toggle, AI lead-summary
 * regeneration, admin edits — see ROADMAP.md's tech-debt entry for this
 * slice). It still correlates with real activity most of the time
 * (every widget turn upserts the row), which is why V1 uses it rather
 * than inventing a fake per-message time.
 */
export function getConversationActivityAt(leadUpdatedAt: string): string {
  return leadUpdatedAt;
}

export type ConversationSummary = {
  leadId: string;
  activityAt: string;
};

/** Stable, descending sort by activity time — the single definition of
 * "neueste tatsächliche Conversation-Aktivität zuerst" so the server
 * function and any client-side re-sort can never disagree. Invalid/
 * unparseable timestamps sort last rather than throwing or corrupting the
 * rest of the order. */
export function sortConversationsByActivity<T extends ConversationSummary>(list: T[]): T[] {
  const time = (iso: string) => {
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
