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

          // ---- Rate limit (anti-spam / anti credit-abuse) ----
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
            "unknown";
          const bucketKey = leadId ?? `ip:${ip}`;
          const minuteBucket = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
          const PER_MINUTE_LIMIT = 20;
          const PER_COMPANY_LIMIT = 120;

          const { data: existingThrottle } = await supabaseAdmin
            .from("widget_throttle")
            .select("count")
            .eq("company_id", company.id)
            .eq("bucket_key", bucketKey)
            .eq("minute_bucket", minuteBucket)
            .maybeSingle();
          const nextCount = (existingThrottle?.count ?? 0) + 1;
          await supabaseAdmin
            .from("widget_throttle")
            .upsert(
              { company_id: company.id, bucket_key: bucketKey, minute_bucket: minuteBucket, count: nextCount },
              { onConflict: "company_id,bucket_key,minute_bucket" },
            );
          if (nextCount > PER_MINUTE_LIMIT) {
            return new Response(
              JSON.stringify({ error: "Zu viele Anfragen. Bitte einen Moment warten." }),
              { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } },
            );
          }
          const { count: companyCount } = await supabaseAdmin
            .from("widget_throttle")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
            .eq("minute_bucket", minuteBucket);
          if ((companyCount ?? 0) > PER_COMPANY_LIMIT) {
            return new Response(
              JSON.stringify({ error: "Chat-Limit für dieses Unternehmen erreicht." }),
              { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } },
            );
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

type LeadIntent = "kauf" | "verkauf" | "bewertung" | "miete" | "sonstiges";

type ExtractedData = {
  name?: string;
  email?: string;
  phone?: string;
  intent?: LeadIntent;
  property_type?: string;
  location?: string;
  object_desc?: string;
  motivation?: string;
  ownership_status?: string;
  usage_type?: string;
  budget?: string;
  asking_price?: string;
  financing?: string;
  timeframe?: string;
  income?: string;
  household_size?: string;
  move_in_date?: string;
  _summary?: string;
  _next_action?: string;
  _score?: "hot" | "warm" | "cold";
  _score_num?: number;
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

function scoreFromData(d: ExtractedData): { label: "hot" | "warm" | "cold"; num: number } {
  const has = (v?: string) => Boolean(v && v.trim().length > 0);
  const contactPts =
    (has(d.name) ? 15 : 0) +
    (has(d.email) ? 20 : 0) +
    (has(d.phone) ? 15 : 0);
  const qualPts =
    (has(d.intent as string) ? 10 : 0) +
    (has(d.property_type) || has(d.object_desc) ? 10 : 0) +
    (has(d.location) ? 5 : 0) +
    (has(d.budget) ? 10 : 0) +
    (has(d.timeframe) || has(d.move_in_date) ? 8 : 0) +
    (has(d.financing) || has(d.usage_type) || has(d.motivation) ? 7 : 0);
  const num = Math.max(0, Math.min(100, d._score_num ?? contactPts + qualPts));
  const label = d._score ?? (num >= 75 ? "hot" : num >= 45 ? "warm" : "cold");
  return { label, num };
}

async function persistLeadFromTranscript(args: {
  companyId: string;
  leadId: string | null;
  messages: UIMessage[];
  assistantText: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const transcript = args.messages.map((m) => ({
    role: m.role,
    content: partsToText(m.parts).replace(DATA_RE, "").trim(),
  }));
  transcript.push({
    role: "assistant",
    content: args.assistantText.replace(DATA_RE, "").trim(),
  });

  const data = extractData(args.assistantText);
  const score = scoreFromData(data);

  const ALLOWED_INTENTS = ["kauf", "miete", "verkauf", "bewertung", "sonstiges"] as const;
  const intent: LeadIntent | "unbekannt" =
    data.intent && (ALLOWED_INTENTS as readonly string[]).includes(data.intent)
      ? (data.intent as LeadIntent)
      : "unbekannt";
  const ALLOWED_STATUS = ["neu", "qualifiziert", "termin"] as const;
  const status =
    data._status && (ALLOWED_STATUS as readonly string[]).includes(data._status)
      ? data._status
      : "neu";

  const payload = {
    company_id: args.companyId,
    name: data.name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    intent: intent as never,
    property_type: data.property_type ?? null,
    location: data.location ?? null,
    object_desc: data.object_desc ?? null,
    motivation: data.motivation ?? null,
    ownership_status: data.ownership_status ?? null,
    usage_type: data.usage_type ?? null,
    budget: data.budget ?? null,
    asking_price: data.asking_price ?? null,
    financing: data.financing ?? null,
    timeframe: data.timeframe ?? null,
    income: data.income ?? null,
    household_size: data.household_size ?? null,
    move_in_date: data.move_in_date ?? null,
    score: score.label,
    score_numeric: score.num,
    status,
    ai_summary: data._summary ?? null,
    next_action: data._next_action ?? null,
    qualification_summary:
      data._summary ??
      transcript.slice(-2).map((t) => `${t.role}: ${t.content}`).join(" · ").slice(0, 280),
    messages: transcript as unknown as never,
  };

  if (args.leadId) {
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
