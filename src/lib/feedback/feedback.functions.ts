// Central Feedback Intelligence data layer (Product Track slice 10) —
// every feedback read/write in the app goes through these server
// functions, never a scattered direct Supabase call from a component.
// Same createServerFn + requireSupabaseAuth pattern as
// properties.functions.ts: `context.supabase` is bound to the caller's
// own JWT (RLS-enforced), tenant isolation is enforced by Postgres
// itself, never by trusting client-supplied company_id.
//
// Ordering discipline (task Abschnitt 10, the core invariant of this
// whole slice): raw feedback is ALWAYS persisted first, in its own
// successful write, before an AI analysis is even attempted. Every
// possible AI failure (missing key, provider error, invalid output) is
// caught and turned into feedback_items.analysis_status='failed' — never
// a thrown error that would look like the whole submission failed, and
// never a rollback of the already-persisted raw_content.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  overrideFeedbackAnalysisSchema,
  submitFeedbackSchema,
  updateFeedbackStatusSchema,
  type FeedbackAnalysisStatus,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackSentiment,
  type FeedbackSource,
  type FeedbackStatus,
} from "@/lib/feedback/feedback-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeedbackItemWithAnalysis = {
  id: string;
  company_id: string;
  submitted_by: string | null;
  source: FeedbackSource;
  raw_content: string;
  status: FeedbackStatus;
  category_override: FeedbackCategory | null;
  priority_override: FeedbackPriority | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  analysis_status: FeedbackAnalysisStatus;
  analysis_attempted_at: string | null;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
  analysis_id: string | null;
  ai_analysis_version: number | null;
  ai_category: FeedbackCategory | null;
  ai_sentiment: FeedbackSentiment | null;
  ai_summary: string | null;
  ai_suggested_priority: "low" | "medium" | "high" | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_provider: string | null;
  ai_analyzed_at: string | null;
};

/** Never the raw feedback text, never the AI summary — only outcome-level
 * facts, matching the existing system_events discipline used across the
 * app (see e.g. email.inbound's `message: "event outcome=..."`). */
async function logFeedbackEvent(args: {
  kind: "success" | "error";
  message: string;
  context: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("system_events")
    .insert({
      kind: args.kind,
      source: "feedback",
      message: args.message,
      // Plain data (strings/numbers), never a class instance or anything
      // circular — safe to widen to the generic Json type Supabase expects.
      context: args.context as never,
    })
    .then(
      () => {},
      () => {},
    );
}

/** Attempts to classify one feedback item and persist the result —
 * shared by submitFeedback (first attempt, version 1) and
 * retryFeedbackAnalysis (any later attempt). Never throws: every failure
 * path is caught and turned into an `analysis_status='failed'` update, so
 * a caller never needs its own try/catch around this.
 *
 * Exported (only) so feedback.integration.test.ts can exercise this exact
 * production code path directly against the real, connected DB, instead
 * of a parallel re-implementation that could silently drift from it. */
export async function runAnalysisAttempt(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  args: { feedbackItemId: string; rawContent: string; analysisVersion: number },
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await supabase
      .from("feedback_items")
      .update({
        analysis_status: "failed",
        analysis_attempted_at: new Date().toISOString(),
        analysis_error: "provider_not_configured",
      })
      .eq("id", args.feedbackItemId);
    await logFeedbackEvent({
      kind: "error",
      message: "feedback_analysis_failed",
      context: { feedbackItemId: args.feedbackItemId, reason: "provider_not_configured" },
    });
    return;
  }

  try {
    const { classifyFeedback, FEEDBACK_CLASSIFICATION_MODEL, FEEDBACK_CLASSIFICATION_PROVIDER } =
      await import("@/lib/feedback/feedback-classification.server");
    const result = await classifyFeedback(args.rawContent, apiKey);

    const { error: analysisErr } = await supabase.from("feedback_analyses").insert({
      feedback_item_id: args.feedbackItemId,
      analysis_version: args.analysisVersion,
      category: result.category,
      sentiment: result.sentiment,
      summary: result.summary,
      suggested_priority: result.suggested_priority,
      confidence: result.confidence,
      model: FEEDBACK_CLASSIFICATION_MODEL,
      provider: FEEDBACK_CLASSIFICATION_PROVIDER,
    });
    if (analysisErr) throw new Error(analysisErr.message);

    await supabase
      .from("feedback_items")
      .update({
        analysis_status: "completed",
        analysis_attempted_at: new Date().toISOString(),
        analysis_error: null,
      })
      .eq("id", args.feedbackItemId);

    await logFeedbackEvent({
      kind: "success",
      message: "feedback_analysis_completed",
      context: {
        feedbackItemId: args.feedbackItemId,
        analysisVersion: args.analysisVersion,
        category: result.category,
      },
    });
  } catch (err) {
    // Deliberately a short, non-sensitive classification, never the raw
    // exception message (which could echo back parts of the prompt/
    // feedback content) or a stack trace — task Abschnitt 10's
    // analysis_error contract.
    const reason =
      err instanceof Error && /timeout|timed out/i.test(err.message) ? "timeout" : "provider_error";
    await supabase
      .from("feedback_items")
      .update({
        analysis_status: "failed",
        analysis_attempted_at: new Date().toISOString(),
        analysis_error: reason,
      })
      .eq("id", args.feedbackItemId);
    await logFeedbackEvent({
      kind: "error",
      message: "feedback_analysis_failed",
      context: {
        feedbackItemId: args.feedbackItemId,
        analysisVersion: args.analysisVersion,
        reason,
      },
    });
  }
}

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitFeedbackSchema.parse(input))
  .handler(async ({ data, context }): Promise<FeedbackItemWithAnalysis> => {
    const { supabase, userId } = context;

    // Looked up here too (not only left to the trigger) — same
    // defense-in-depth precedent as createProperty's company lookup: a
    // clear "kein Unternehmen gefunden" error before the insert is
    // attempted, and tg_set_feedback_item_company still re-derives/
    // overwrites it independently either way.
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (companyErr) throw new Error(companyErr.message);
    if (!company) throw new Error("Kein Unternehmen für diesen Nutzer gefunden.");

    // ---- Phase 1: persist raw feedback — this must succeed on its own,
    // independent of anything AI-related below. ----
    const { data: created, error } = await supabase
      .from("feedback_items")
      .insert({ raw_content: data.content, company_id: company.id })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logFeedbackEvent({
      kind: "success",
      message: "feedback_created",
      context: { feedbackItemId: created.id },
    });

    // ---- Phase 2: best-effort AI analysis — failure here never undoes
    // Phase 1 and never throws back to the caller. ----
    await runAnalysisAttempt(supabase, {
      feedbackItemId: created.id,
      rawContent: data.content,
      analysisVersion: 1,
    });

    const { data: withAnalysis, error: reloadErr } = await supabase
      .from("feedback_items_with_latest_analysis")
      .select("*")
      .eq("id", created.id)
      .single();
    if (reloadErr) throw new Error(reloadErr.message);
    return withAnalysis as FeedbackItemWithAnalysis;
  });

/** Every feedback item belonging to the caller's own company (RLS-scoped
 * via the underlying view's security_invoker), joined to its current
 * analysis if one exists. Newest first. */
export const getCompanyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedbackItemWithAnalysis[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("feedback_items_with_latest_analysis")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as FeedbackItemWithAnalysis[];
  });

export const updateFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateFeedbackStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("feedback_items")
      .update({ status: data.status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.feedbackItemId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Feedback nicht gefunden.");
    await logFeedbackEvent({
      kind: "success",
      message: "feedback_reviewed",
      context: { feedbackItemId: data.feedbackItemId, action: "status", status: data.status },
    });
    return updated;
  });

/** Human override of category/priority (task Abschnitt 13) — writes only
 * to feedback_items.category_override/priority_override, NEVER to
 * feedback_analyses (which stays append-only/immutable) — see
 * feedback-rules.ts's resolveEffectiveCategory/resolveEffectivePriority
 * for how these take precedence over the AI suggestion, and the
 * migration's comment for why a later AI run can therefore never
 * silently clobber this. */
export const overrideFeedbackAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => overrideFeedbackAnalysisSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      reviewed_by: string;
      reviewed_at: string;
      category_override?: string | null;
      priority_override?: string | null;
    } = { reviewed_by: userId, reviewed_at: new Date().toISOString() };
    if (data.categoryOverride !== undefined) patch.category_override = data.categoryOverride;
    if (data.priorityOverride !== undefined) patch.priority_override = data.priorityOverride;

    const { data: updated, error } = await supabase
      .from("feedback_items")
      .update(patch)
      .eq("id", data.feedbackItemId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Feedback nicht gefunden.");
    await logFeedbackEvent({
      kind: "success",
      message: "feedback_reviewed",
      context: { feedbackItemId: data.feedbackItemId, action: "override" },
    });
    return updated;
  });

/** Manual retry after a pending/failed analysis (task Abschnitt 10:
 * "spätere Wiederholung muss möglich sein") — always inserts a NEW
 * feedback_analyses row (next analysis_version), never updates an
 * existing one. */
export const retryFeedbackAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ feedbackItemId: z.string().regex(UUID_RE) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FeedbackItemWithAnalysis> => {
    const { supabase } = context;

    const { data: item, error: itemErr } = await supabase
      .from("feedback_items")
      .select("id, raw_content")
      .eq("id", data.feedbackItemId)
      .maybeSingle();
    if (itemErr) throw new Error(itemErr.message);
    if (!item) throw new Error("Feedback nicht gefunden.");

    const { data: existing, error: versionErr } = await supabase
      .from("feedback_analyses")
      .select("analysis_version")
      .eq("feedback_item_id", data.feedbackItemId)
      .order("analysis_version", { ascending: false })
      .limit(1);
    if (versionErr) throw new Error(versionErr.message);
    const nextVersion = (existing?.[0]?.analysis_version ?? 0) + 1;

    await runAnalysisAttempt(supabase, {
      feedbackItemId: data.feedbackItemId,
      rawContent: item.raw_content,
      analysisVersion: nextVersion,
    });

    const { data: withAnalysis, error: reloadErr } = await supabase
      .from("feedback_items_with_latest_analysis")
      .select("*")
      .eq("id", data.feedbackItemId)
      .single();
    if (reloadErr) throw new Error(reloadErr.message);
    return withAnalysis as FeedbackItemWithAnalysis;
  });
