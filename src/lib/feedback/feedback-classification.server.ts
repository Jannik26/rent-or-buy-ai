// AI classification for Feedback Intelligence V1 (Product Track slice 10)
// — the ONLY place that calls out to an AI provider for feedback
// classification. Deliberately a thin, minimal extension of the existing
// AI path (task Abschnitt 9: "keine riesige universelle AI-Plattform
// bauen"), same shape as lead-summary.server.ts's
// generateLeadSummaryFromTranscript — not a new abstraction layer.
//
// Provider details (model name, `ai` SDK call shape) are fully contained
// here; callers only ever see FeedbackAnalysisOutput (feedback-rules.ts),
// never a provider-specific response shape.
import { generateText, Output } from "ai";
import { createAnthropicProvider } from "@/lib/ai-gateway.server";
import {
  buildFeedbackClassificationInstructions,
  FeedbackAnalysisOutputSchema,
  type FeedbackAnalysisOutput,
} from "@/lib/feedback/feedback-rules";

export const FEEDBACK_CLASSIFICATION_MODEL = "claude-sonnet-5";
export const FEEDBACK_CLASSIFICATION_PROVIDER = "anthropic";

/**
 * Pure-ish AI call (no DB I/O) — takes the raw feedback text and an API
 * key, returns a schema-validated structured result or throws. The only
 * data sent to the provider is `rawContent` itself (task Abschnitt 14: "AI
 * Aufruf nur mit notwendigen Daten") — no company name, no submitter
 * identity, no other feedback items.
 *
 * `Output.object({ schema })` already enforces the shape at the AI SDK
 * layer, but this function makes no assumption that enforcement is
 * airtight — the caller (feedback.functions.ts) treats ANY thrown error
 * here (network failure, provider error, schema mismatch) identically: a
 * failed analysis attempt that never touches feedback_items.raw_content
 * (task Abschnitt 10).
 */
export async function classifyFeedback(
  rawContent: string,
  apiKey: string,
): Promise<FeedbackAnalysisOutput> {
  const anthropic = createAnthropicProvider(apiKey);
  const { experimental_output } = await generateText({
    model: anthropic(FEEDBACK_CLASSIFICATION_MODEL),
    experimental_output: Output.object({ schema: FeedbackAnalysisOutputSchema }),
    system: buildFeedbackClassificationInstructions(),
    prompt: rawContent,
  });
  // Belt-and-braces re-validation: Output.object already enforces this at
  // generation time, but parsing again here means a future AI SDK
  // version's looser guarantee can never silently let an invalid shape
  // through un-checked.
  return FeedbackAnalysisOutputSchema.parse(experimental_output);
}
