import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { LeadSummarySchema, buildSummaryInstructions, type LeadSummary } from "@/lib/lead-summary-schema";

type Msg = { role: string; content: string };

function transcriptToPrompt(messages: Msg[]) {
  return messages
    .map((m) => `${m.role === "user" ? "Interessent" : "Assistent"}: ${m.content}`)
    .join("\n");
}

/** Pure AI call — used by server fn and by the public widget endpoint. */
export async function generateLeadSummaryFromTranscript(
  messages: Msg[],
  apiKey: string,
): Promise<LeadSummary> {
  const gateway = createLovableAiGatewayProvider(apiKey);
  const { experimental_output } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    experimental_output: Output.object({ schema: LeadSummarySchema }),
    system: buildSummaryInstructions(),
    prompt: `Transkript:\n\n${transcriptToPrompt(messages)}`,
  });
  return experimental_output as LeadSummary;
}

/** Map a structured summary to the leads update payload. */
export function summaryToLeadUpdate(s: LeadSummary) {
  return {
    score_numeric: s.score_numeric,
    score: s.score,
    intent: s.intent as never,
    property_type: s.property_type,
    location: s.location,
    timeframe: s.timeframe,
    motivation: s.motivation,
    budget: s.budget,
    asking_price: s.asking_price,
    financing: s.financing,
    next_action: s.next_action,
    ai_summary: s.ai_summary,
    name: s.name,
    email: s.email,
    phone: s.phone,
    summary_generated_at: new Date().toISOString(),
  };
}
