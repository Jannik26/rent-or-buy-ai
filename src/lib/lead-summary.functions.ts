import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { LeadSummarySchema, buildSummaryInstructions, type LeadSummary } from "@/lib/lead-summary-schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Msg = { role: string; content: string };

function transcriptToPrompt(messages: Msg[]) {
  return messages
    .map((m) => `${m.role === "user" ? "Interessent" : "Assistent"}: ${m.content}`)
    .join("\n");
}

export const regenerateLeadSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ leadId: z.string().regex(UUID_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Ownership check via RLS: SELECT lead joined with company.owner_id
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, company_id, messages, companies!inner(owner_id)")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead nicht gefunden");
    // Defensive ownership re-check
    const owner = (lead as unknown as { companies: { owner_id: string } }).companies?.owner_id;
    if (owner !== userId) throw new Error("Forbidden");

    const messages = (lead.messages ?? []) as Msg[];
    if (messages.length === 0) throw new Error("Keine Nachrichten im Transkript.");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI-Gateway-Key fehlt");

    const gateway = createLovableAiGatewayProvider(key);

    const { experimental_output: summary } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: LeadSummarySchema }),
      system: buildSummaryInstructions(),
      prompt: `Transkript:\n\n${transcriptToPrompt(messages)}`,
    });

    const s = summary as LeadSummary;

    const { error: updateErr } = await supabase
      .from("leads")
      .update({
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
      })
      .eq("id", data.leadId);
    if (updateErr) throw new Error(updateErr.message);

    return s;
  });
