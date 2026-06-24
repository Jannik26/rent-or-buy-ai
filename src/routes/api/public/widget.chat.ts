import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSystemPrompt } from "@/lib/chat-prompt";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 50;
const MAX_CHARS_PER_MSG = 4000;
const USER_DATA_MARKER_RE = /<<DATA>>|<<END>>/gi;

type Body = { messages?: UIMessage[]; companyId?: string; leadId?: string | null };

function sanitizeUserMessages(messages: UIMessage[]): UIMessage[] {
  return messages.slice(-MAX_MESSAGES).map((m) => {
    if (m.role !== "user") return m;
    const parts = (m.parts ?? []).map((p) => {
      if (p.type !== "text") return p;
      const text = String((p as { text: string }).text ?? "")
        .replace(USER_DATA_MARKER_RE, "")
        .slice(0, MAX_CHARS_PER_MSG);
      return { ...p, text } as typeof p;
    });
    return { ...m, parts };
  });
}

export const Route = createFileRoute("/api/public/widget/chat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const rawMessages = body.messages;
          const companyId = body.companyId;
          console.log("[widget] chat request", {
            companyId,
            leadId: body.leadId,
            messageCount: Array.isArray(rawMessages) ? rawMessages.length : 0,
          });
          if (!Array.isArray(rawMessages) || !companyId || !UUID_RE.test(companyId)) {
            return new Response(JSON.stringify({ error: "Ungültige Anfrage." }), {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }
          if (rawMessages.length === 0) {
            return new Response(JSON.stringify({ error: "Keine Nachrichten." }), {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }
          const leadIdRaw = body.leadId ?? null;
          const leadId = leadIdRaw && UUID_RE.test(leadIdRaw) ? leadIdRaw : null;

          const messages = sanitizeUserMessages(rawMessages as UIMessage[]);

          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            console.error("[widget] LOVABLE_API_KEY fehlt");
            return new Response(
              JSON.stringify({ error: "KI-Dienst ist nicht konfiguriert (LOVABLE_API_KEY fehlt)." }),
              { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
            );
          }



          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: company } = await supabaseAdmin
            .from("companies")
            .select("id, name")
            .eq("id", companyId)
            .maybeSingle();

          if (!company) {
            return new Response(JSON.stringify({ error: "Unbekanntes Unternehmen." }), {
              status: 404,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }

          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");

          const result = streamText({
            model,
            system: buildSystemPrompt(company.name),
            messages: await convertToModelMessages(messages as UIMessage[]),
            onError: (event) => {
              console.error("[widget] streamText error", event);
              const message = event instanceof Error ? event.message : JSON.stringify(event);
              void supabaseAdmin
                .from("system_events")
                .insert({
                  kind: "error",
                  source: "widget.chat.stream",
                  message: message.slice(0, 500),
                  context: { companyId: company.id },
                });
            },
            onFinish: async ({ text }) => {
              console.log("[widget] chat finished", { chars: text.length });
              await supabaseAdmin
                .from("system_events")
                .insert({
                  kind: "success",
                  source: "widget.chat",
                  message: text.replace(/<<DATA>>[\s\S]*?<<END>>/g, "").trim().slice(0, 240),
                  context: { companyId: company.id, chars: text.length },
                });
              try {
                await persistLeadFromTranscript({
                  companyId: company.id,
                  leadId,
                  messages,
                  assistantText: text,
                });
              } catch (err) {
                console.error("[widget] persist error", err);
              }

            },
          });

          return result.toUIMessageStreamResponse({
            headers: corsHeaders,
            originalMessages: messages as UIMessage[],
          });
        } catch (err) {
          console.error("[widget] error", err);
          const msg = err instanceof Error ? err.message : "error";
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("system_events").insert({
              kind: "error",
              source: "widget.chat.request",
              message: msg.slice(0, 500),
            });
          } catch {
            /* ignore */
          }
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
      },
    },
  },
});

const DATA_RE = /<<DATA>>([\s\S]*?)<<END>>/g;

type ExtractedData = {
  name?: string;
  email?: string;
  phone?: string;
  intent?: "kauf" | "miete";
  object_desc?: string;
  budget?: string;
  financing?: string;
  timeframe?: string;
  income?: string;
  household_size?: string;
  move_in_date?: string;
  _score?: "hot" | "warm" | "cold";
  _status?: string;
};

function partsToText(parts: UIMessage["parts"]) {
  return parts
    .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
    .join("");
}

function extractData(text: string): ExtractedData {
  const merged: ExtractedData = {};
  let m: RegExpExecArray | null;
  while ((m = DATA_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as ExtractedData;
      Object.assign(merged, parsed);
    } catch {
      /* ignore parse errors */
    }
  }
  return merged;
}

function scoreFromData(d: ExtractedData): "hot" | "warm" | "cold" {
  if (d._score) return d._score;
  const has = (v?: string) => Boolean(v && v.trim().length > 0);
  const contactCount = [has(d.name), has(d.email) || has(d.phone)].filter(Boolean).length;
  const qualCount = [
    has(d.budget),
    has(d.intent),
    has(d.object_desc) || has(d.move_in_date),
    has(d.financing) || has(d.income),
  ].filter(Boolean).length;
  if (contactCount >= 2 && qualCount >= 3) return "hot";
  if (contactCount >= 1 && qualCount >= 2) return "warm";
  return "cold";
}

async function persistLeadFromTranscript(args: {
  companyId: string;
  leadId: string | null;
  messages: UIMessage[];
  assistantText: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Build clean transcript (strip DATA markers)
  const transcript = args.messages.map((m) => ({
    role: m.role,
    content: partsToText(m.parts).replace(DATA_RE, "").trim(),
  }));
  transcript.push({
    role: "assistant",
    content: args.assistantText.replace(DATA_RE, "").trim(),
  });

  // Collect data ONLY from the AI assistant's own response — never trust
  // <<DATA>> markers smuggled in by the client in user messages.
  const data = extractData(args.assistantText);
  const score = scoreFromData(data);

  const payload = {
    company_id: args.companyId,
    name: data.name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    intent: (data.intent ?? "unbekannt") as "kauf" | "miete" | "unbekannt",
    object_desc: data.object_desc ?? null,
    budget: data.budget ?? null,
    financing: data.financing ?? null,
    timeframe: data.timeframe ?? null,
    income: data.income ?? null,
    household_size: data.household_size ?? null,
    move_in_date: data.move_in_date ?? null,
    score,
    status: data._status ?? "neu",
    qualification_summary: transcript.slice(-2).map((t) => `${t.role}: ${t.content}`).join(" · ").slice(0, 280),
    messages: transcript as unknown as never,
  };

  if (args.leadId) {
    // Cross-company guard: refuse to upsert a lead that already belongs to a different company.
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("company_id")
      .eq("id", args.leadId)
      .maybeSingle();
    if (existing && existing.company_id !== args.companyId) {
      console.warn("[widget] leadId belongs to different company — inserting new lead instead");
      await supabaseAdmin.from("leads").insert(payload);
      return;
    }
    await supabaseAdmin.from("leads").upsert({ id: args.leadId, ...payload });
  } else {
    await supabaseAdmin.from("leads").insert(payload);
  }
}

  const score = scoreFromData(data);

  const payload = {
    company_id: args.companyId,
    name: data.name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    intent: (data.intent ?? "unbekannt") as "kauf" | "miete" | "unbekannt",
    object_desc: data.object_desc ?? null,
    budget: data.budget ?? null,
    financing: data.financing ?? null,
    timeframe: data.timeframe ?? null,
    income: data.income ?? null,
    household_size: data.household_size ?? null,
    move_in_date: data.move_in_date ?? null,
    score,
    status: data._status ?? "neu",
    qualification_summary: transcript.slice(-2).map((t) => `${t.role}: ${t.content}`).join(" · ").slice(0, 280),
    messages: transcript as unknown as never,
  };

  if (args.leadId) {
    await supabaseAdmin.from("leads").upsert({ id: args.leadId, ...payload });
  } else {
    await supabaseAdmin.from("leads").insert(payload);
  }
}
