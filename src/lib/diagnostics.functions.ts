import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

export type DiagnosticsResult = {
  checkedAt: string;
  companyId: { ok: boolean; value: string };
  supabase: { ok: boolean; detail: string };
  lovableApiKey: { ok: boolean; detail: string };
  aiModel: { ok: boolean; detail: string; sample?: string };
  lastError: { at: string; source: string; message: string } | null;
  lastSuccess: { at: string; source: string; message: string } | null;
};

export const runDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsResult> => {
    // Admin role check — diagnostics expose cross-company operational data.
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      throw new Response("Forbidden – Admin-Rolle erforderlich.", { status: 403 });
    }

    const checkedAt = new Date().toISOString();


    // Supabase + companyId check
    let supabase = { ok: false, detail: "Nicht geprüft" };
    let companyId = { ok: false, value: DEMO_COMPANY_ID };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("companies")
        .select("id, name")
        .eq("id", DEMO_COMPANY_ID)
        .maybeSingle();
      if (error) {
        supabase = { ok: false, detail: `DB-Fehler: ${error.message}` };
      } else {
        supabase = { ok: true, detail: "Verbunden" };
        companyId = data
          ? { ok: true, value: data.id }
          : { ok: false, value: DEMO_COMPANY_ID };
      }
    } catch (err) {
      supabase = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }

    // API key
    const key = process.env.LOVABLE_API_KEY;
    const lovableApiKey = key
      ? { ok: true, detail: `Vorhanden (Länge ${key.length})` }
      : { ok: false, detail: "Fehlt – KI-Aufrufe werden fehlschlagen." };

    // AI model ping
    let aiModel: DiagnosticsResult["aiModel"] = { ok: false, detail: "Nicht geprüft" };
    if (key) {
      try {
        const gateway = createLovableAiGatewayProvider(key);
        const { text } = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          prompt: "Antworte mit genau einem Wort: pong",
        });
        aiModel = { ok: true, detail: "Modell antwortet", sample: text.trim().slice(0, 80) };
      } catch (err) {
        aiModel = {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    } else {
      aiModel = { ok: false, detail: "Übersprungen – API-Key fehlt." };
    }

    // Last events
    let lastError: DiagnosticsResult["lastError"] = null;
    let lastSuccess: DiagnosticsResult["lastSuccess"] = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: errRow }, { data: okRow }] = await Promise.all([
        supabaseAdmin
          .from("system_events")
          .select("created_at, source, message")
          .eq("kind", "error")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("system_events")
          .select("created_at, source, message")
          .eq("kind", "success")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (errRow) lastError = { at: errRow.created_at, source: errRow.source, message: errRow.message };
      if (okRow) lastSuccess = { at: okRow.created_at, source: okRow.source, message: okRow.message };
    } catch {
      /* ignore */
    }

    return { checkedAt, companyId, supabase, lovableApiKey, aiModel, lastError, lastSuccess };
  });

