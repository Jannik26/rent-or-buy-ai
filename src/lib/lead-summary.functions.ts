import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Msg = { role: string; content: string };

export const regenerateLeadSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error } = await supabase
      .from("leads")
      .select(
        "id, company_id, messages, companies!inner(owner_id, subscription_status, demo_expires_at, subscription_expires_at)",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead nicht gefunden");
    const company = (
      lead as unknown as {
        companies: {
          owner_id: string;
          subscription_status: string | null;
          demo_expires_at: string | null;
          subscription_expires_at: string | null;
        };
      }
    ).companies;
    if (company?.owner_id !== userId) throw new Error("Forbidden");

    requireActiveSubscription(
      {
        subscription_status: company.subscription_status,
        demo_expires_at: company.demo_expires_at,
        subscription_expires_at: company.subscription_expires_at,
      },
      new Date(),
    );

    const messages = (lead.messages ?? []) as Msg[];
    if (messages.length === 0) throw new Error("Keine Nachrichten im Transkript.");

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("AI-Gateway-Key fehlt");

    const { generateLeadSummaryFromTranscript, summaryToLeadUpdate } =
      await import("@/lib/lead-summary.server");
    const summary = await generateLeadSummaryFromTranscript(messages, key);

    const { error: updateErr } = await supabase
      .from("leads")
      .update(summaryToLeadUpdate(summary))
      .eq("id", data.leadId);
    if (updateErr) throw new Error(updateErr.message);

    return summary;
  });
