// Pure, unit-tested rules for Feedback Intelligence V1 (Product Track
// slice 10, see ROADMAP.md and docs/platform-modules.md 5.3). No Supabase
// I/O, no AI SDK call here (those live in feedback.functions.ts /
// feedback-classification.server.ts) — mirrors the established pattern in
// src/lib/appointments/appointment-rules.ts and
// src/lib/properties/property-rules.ts.
import { z } from "zod";

export const FEEDBACK_SOURCES = ["manual", "support", "conversation", "email", "system"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_STATUSES = ["new", "reviewed", "planned", "resolved", "dismissed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_CATEGORIES = [
  "bug",
  "feature_request",
  "ux",
  "performance",
  "integration",
  "pricing",
  "support",
  "positive",
  "other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Full priority vocabulary, including 'critical' — used for the DB CHECK
 * on `feedback_items.priority_override` and for the human-override UI.
 * NOT the AI's output vocabulary — see AI_SUGGESTABLE_PRIORITIES below. */
export const FEEDBACK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];

/** What the AI classification is actually allowed to suggest (task
 * Abschnitt 12: "critical nur für klar definierte technische/
 * sicherheitsrelevante Fälle") — enforced structurally by the DB CHECK on
 * `feedback_analyses.suggested_priority` (see the migration) and mirrored
 * here so the Zod schema the AI output is validated against can never
 * even represent 'critical'. A human is the only path to that value. */
export const AI_SUGGESTABLE_PRIORITIES = ["low", "medium", "high"] as const;
export type AiSuggestablePriority = (typeof AI_SUGGESTABLE_PRIORITIES)[number];

export const FEEDBACK_SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

export const FEEDBACK_ANALYSIS_STATUSES = ["pending", "completed", "failed"] as const;
export type FeedbackAnalysisStatus = (typeof FEEDBACK_ANALYSIS_STATUSES)[number];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Fehler",
  feature_request: "Feature-Wunsch",
  ux: "UX",
  performance: "Performance",
  integration: "Integration",
  pricing: "Preise",
  support: "Support",
  positive: "Positives Feedback",
  other: "Sonstiges",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Neu",
  reviewed: "Gesichtet",
  planned: "Geplant",
  resolved: "Erledigt",
  dismissed: "Verworfen",
};

export const FEEDBACK_PRIORITY_LABEL: Record<FeedbackPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Submission ----

export const submitFeedbackSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Bitte ein Feedback eingeben.")
    .max(4000, "Maximal 4000 Zeichen."),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

// ---- Human review (task Abschnitt 13) ----

export const updateFeedbackStatusSchema = z.object({
  feedbackItemId: z.string().regex(UUID_RE, "Ungültige Feedback-ID."),
  status: z.enum(FEEDBACK_STATUSES),
});
export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;

/** Both override fields optional but at least one must be present — an
 * override call that changes nothing is a caller bug, not a valid no-op
 * (same discipline as updateAppointment's "keine Änderungen übergeben"
 * check, enforced here at the schema level instead). */
export const overrideFeedbackAnalysisSchema = z
  .object({
    feedbackItemId: z.string().regex(UUID_RE, "Ungültige Feedback-ID."),
    categoryOverride: z.enum(FEEDBACK_CATEGORIES).nullable().optional(),
    priorityOverride: z.enum(FEEDBACK_PRIORITIES).nullable().optional(),
  })
  .refine((v) => v.categoryOverride !== undefined || v.priorityOverride !== undefined, {
    message: "Mindestens eine Änderung angeben.",
  });
export type OverrideFeedbackAnalysisInput = z.infer<typeof overrideFeedbackAnalysisSchema>;

// ---- AI output contract (task Abschnitt 9) ----
// Validated server-side against exactly this schema — an AI response that
// doesn't parse is treated as a failed analysis attempt (see
// feedback.functions.ts), never coerced/guessed into a valid shape and
// never allowed to touch feedback_items.raw_content.

export const FeedbackAnalysisOutputSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  sentiment: z.enum(FEEDBACK_SENTIMENTS).nullable(),
  summary: z.string().min(1).max(500),
  suggested_priority: z.enum(AI_SUGGESTABLE_PRIORITIES),
  confidence: z.number().min(0).max(1).nullable(),
});
export type FeedbackAnalysisOutput = z.infer<typeof FeedbackAnalysisOutputSchema>;

// ---- Effective category/priority resolution (task Abschnitt 13) ----
// THE single place that decides "what do we show as the category/priority
// right now" — human override always wins, and because overrides live on
// feedback_items (never touched by a new feedback_analyses row, which is
// append-only), this can never be silently undone by a later AI run.

export type EffectiveValue<T> = { value: T | null; source: "human" | "ai" | "none" };

export function resolveEffectiveCategory(item: {
  category_override: FeedbackCategory | null;
  ai_category: FeedbackCategory | null;
}): EffectiveValue<FeedbackCategory> {
  if (item.category_override) return { value: item.category_override, source: "human" };
  if (item.ai_category) return { value: item.ai_category, source: "ai" };
  return { value: null, source: "none" };
}

export function resolveEffectivePriority(item: {
  priority_override: FeedbackPriority | null;
  ai_suggested_priority: AiSuggestablePriority | null;
}): EffectiveValue<FeedbackPriority> {
  if (item.priority_override) return { value: item.priority_override, source: "human" };
  if (item.ai_suggested_priority) return { value: item.ai_suggested_priority, source: "ai" };
  return { value: null, source: "none" };
}

// ---- AI classification prompt (task Abschnitt 9) ----
// Deterministic instructions, no lead/company data included — only the
// raw feedback text itself is ever sent (task Abschnitt 14: "AI-Aufruf nur
// mit notwendigen Daten").

export function buildFeedbackClassificationInstructions(): string {
  return `Du bist ein Produktanalyst für die B2B-SaaS-Plattform EstateAI (Immobilienmakler-Software). Du bekommst ein einzelnes, unverändertes Feedback eines Maklers zum Produkt EstateAI selbst (nicht zu einer Immobilie).

Klassifiziere es ausschließlich anhand dieser Kategorien: ${FEEDBACK_CATEGORIES.join(", ")}.

Antworte ausschließlich mit JSON in exakt diesem Schema:
{
  "category": ${FEEDBACK_CATEGORIES.map((c) => `"${c}"`).join(" | ")},
  "sentiment": ${FEEDBACK_SENTIMENTS.map((s) => `"${s}"`).join(" | ")} | null,
  "summary": string (max. 500 Zeichen, Englisch, neutral, nur was tatsächlich gesagt wurde),
  "suggested_priority": "low" | "medium" | "high",
  "confidence": Zahl zwischen 0 und 1, oder null
}

Wichtige Regeln:
- Erfinde nichts, das nicht im Text steht. Keine Dringlichkeit/Priorität behaupten, die nicht ausgedrückt wurde.
- "suggested_priority" ist ausschließlich eine Empfehlung, niemals "critical" (dieser Wert ist ausschließlich Menschen vorbehalten und wird von dir nie vergeben).
- "summary" ist eine neutrale Zusammenfassung, keine Übertreibung, keine erfundenen Details.
- Nutze "other", wenn keine der übrigen Kategorien wirklich passt — nie eine neue, freie Kategorie erfinden.`;
}
