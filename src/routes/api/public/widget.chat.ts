import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, type UIMessage } from "ai";
import { createAnthropicProvider } from "@/lib/ai-gateway.server";
import { buildSystemPrompt } from "@/lib/chat-prompt";
import { responseTimePhrase } from "@/lib/response-time";
import { isPlusAddressed, normalizeEmail } from "@/lib/validate-email";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";
const MAX_MESSAGES = 50;
const MAX_CHARS_PER_MSG = 4000;
const USER_DATA_MARKER_RE = /<<DATA>>|<<END>>/gi;

// ---- Demo-Nutzungslimits (Kostenschutz) ----
const DAILY_COMPANY_LIMIT = 25; // KI-Nachrichten pro company_id pro Tag (Demo)
const SESSION_LIMIT = 8; // KI-Nachrichten pro Session (leadId)
const CONTEXT_MESSAGE_LIMIT = 12; // max. Nachrichten-Historie, die an Claude geschickt wird
const DAILY_LIMIT_TEXT =
  "Danke für Ihre Anfrage. Für diese Demo ist das tägliche Gesprächslimit erreicht. Bitte hinterlassen Sie Ihre Kontaktdaten oder kontaktieren Sie das Immobilienbüro direkt.";
const SESSION_LIMIT_TEXT =
  "Danke, ich habe die wichtigsten Informationen aufgenommen. Für die Demo ist dieses Gespräch jetzt begrenzt. Das Immobilienbüro kann sich mit Ihnen in Verbindung setzen.";

// ---- 14-Tage-Demo / Abo-Status ----
type CompanyAccess = { id: string; subscription_status: string | null; demo_expires_at: string | null };
type AccessResult = { allowed: true } | { allowed: false; code: "DEMO_EXPIRED" | "ACCOUNT_INACTIVE"; message: string };

function isCompanyAllowedToUseWidget(company: CompanyAccess): AccessResult {
  const status = company.subscription_status;
  if (status === null || status === undefined || status === "active") {
    return { allowed: true };
  }
  if (status === "trial") {
    const expires = company.demo_expires_at ? new Date(company.demo_expires_at) : null;
    if (expires && expires.getTime() > Date.now()) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: "DEMO_EXPIRED",
      message: "Die 14-tägige EstateAI-Demo ist abgelaufen. Bitte kontaktieren Sie den Anbieter.",
    };
  }
  // "expired" | "paused" | "cancelled" | jeder unbekannte Wert
  return {
    allowed: false,
    code: "ACCOUNT_INACTIVE",
    message: "Dieses EstateAI-Widget ist aktuell nicht aktiv.",
  };
}

function fixedAssistantReply(text: string) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream, headers: corsHeaders });
}

type Body = { messages?: UIMessage[]; companyId?: string; leadId?: string | null };

function isPublicDemoRequest(request: Request) {
  const ref = request.headers.get("referer") ?? request.headers.get("referrer") ?? "";
  if (!ref) return false;
  try {
    return new URL(ref).pathname === "/demo";
  } catch {
    return false;
  }
}

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
          if (companyId === DEMO_COMPANY_ID && !isPublicDemoRequest(request)) {
            console.warn("[widget] blocked demo company outside public /demo", {
              referer: request.headers.get("referer") ?? request.headers.get("referrer") ?? null,
            });
            return new Response(JSON.stringify({ error: "Demo-Unternehmen ist nur auf der öffentlichen Demo erlaubt." }), {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }
          const leadIdRaw = body.leadId ?? null;
          const leadId = leadIdRaw && UUID_RE.test(leadIdRaw) ? leadIdRaw : null;

          const messages = sanitizeUserMessages(rawMessages as UIMessage[]);

          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) {
            console.error("[widget] ANTHROPIC_API_KEY fehlt");
            return new Response(
              JSON.stringify({ error: "KI-Dienst ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt)." }),
              { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: company } = await supabaseAdmin
            .from("companies")
            .select("id, name, subscription_status, demo_expires_at, response_time")
            .eq("id", companyId)
            .maybeSingle();

          if (!company) {
            return new Response(JSON.stringify({ error: "Unbekanntes Unternehmen." }), {
              status: 404,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }

          const access = isCompanyAllowedToUseWidget(company);
          if (!access.allowed) {
            await supabaseAdmin.from("system_events").insert({
              kind: "error",
              source: access.code === "DEMO_EXPIRED" ? "widget.chat.demo_expired" : "widget.chat.account_inactive",
              message: access.message,
              context: { companyId: company.id, subscriptionStatus: company.subscription_status },
            });
            return new Response(JSON.stringify({ error: access.code, message: access.message }), {
              status: 403,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }

          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
            "unknown";
          const bucketKey = leadId ?? `ip:${ip}`;

          // ---- Demo-Nutzungslimits (Tageslimit pro Firma + Session-Limit) ----
          const dayBucket = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
          const sessionBucketKey = `session:${bucketKey}`;

          const [{ data: dailyRow }, { data: sessionRow }] = await Promise.all([
            supabaseAdmin
              .from("widget_throttle")
              .select("count")
              .eq("company_id", company.id)
              .eq("bucket_key", "daily")
              .eq("minute_bucket", dayBucket)
              .maybeSingle(),
            supabaseAdmin
              .from("widget_throttle")
              .select("count")
              .eq("company_id", company.id)
              .eq("bucket_key", sessionBucketKey)
              .eq("minute_bucket", dayBucket)
              .maybeSingle(),
          ]);
          const dailyCount = dailyRow?.count ?? 0;
          const sessionCount = sessionRow?.count ?? 0;

          if (dailyCount >= DAILY_COMPANY_LIMIT) {
            await supabaseAdmin.from("system_events").insert({
              kind: "success",
              source: "widget.chat.limit_daily",
              message: `Demo-Tageslimit erreicht (company ${company.id})`,
              context: { companyId: company.id, leadId, count: dailyCount },
            });
            return fixedAssistantReply(DAILY_LIMIT_TEXT);
          }
          if (sessionCount >= SESSION_LIMIT) {
            await supabaseAdmin.from("system_events").insert({
              kind: "success",
              source: "widget.chat.limit_session",
              message: `Demo-Session-Limit erreicht (company ${company.id})`,
              context: { companyId: company.id, leadId, count: sessionCount },
            });
            return fixedAssistantReply(SESSION_LIMIT_TEXT);
          }

          await Promise.all([
            supabaseAdmin
              .from("widget_throttle")
              .upsert(
                { company_id: company.id, bucket_key: "daily", minute_bucket: dayBucket, count: dailyCount + 1 },
                { onConflict: "company_id,bucket_key,minute_bucket" },
              ),
            supabaseAdmin
              .from("widget_throttle")
              .upsert(
                { company_id: company.id, bucket_key: sessionBucketKey, minute_bucket: dayBucket, count: sessionCount + 1 },
                { onConflict: "company_id,bucket_key,minute_bucket" },
              ),
          ]);

          // ---- Rate limit (anti-spam / anti credit-abuse) ----
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

          const anthropic = createAnthropicProvider(key);
          const model = anthropic("claude-sonnet-5");

          const modelMessages = messages.slice(-CONTEXT_MESSAGE_LIMIT);

          const result = streamText({
            model,
            system: buildSystemPrompt(company.name, responseTimePhrase(company.response_time)),
            messages: await convertToModelMessages(modelMessages as UIMessage[]),
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
                console.log("companyId received:", companyId);
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

const MERGE_FIELDS = [
  "name",
  "email",
  "phone",
  "property_type",
  "location",
  "object_desc",
  "motivation",
  "ownership_status",
  "usage_type",
  "budget",
  "asking_price",
  "financing",
  "timeframe",
  "move_in_date",
  // income/household_size bewusst nicht erfasst (Datenminimierung, DSGVO) —
  // Spalten existieren noch in der DB (Legacy), werden über diesen Pfad aber nie mehr befüllt.
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];
type ExistingLeadRow = Partial<Record<MergeField, string | null>> & {
  company_id: string;
  intent: string | null;
  status: string | null;
  ai_summary: string | null;
  next_action: string | null;
  qualification_summary: string | null;
};

async function persistLeadFromTranscript(args: {
  companyId: string;
  leadId: string | null;
  messages: UIMessage[];
  assistantText: string;
}) {
  console.log("Saving lead for company:", args.companyId);
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

  if (data.email) {
    const normalizedEmail = normalizeEmail(data.email);
    if (isPlusAddressed(normalizedEmail)) {
      console.warn("[widget] dropped plus-addressed lead email", { companyId: args.companyId });
      await supabaseAdmin.from("system_events").insert({
        kind: "error",
        source: "widget.chat.plus_address_rejected",
        message: "Plus-addressed email extracted from chat was not stored.",
        context: { companyId: args.companyId, leadId: args.leadId },
      });
      delete data.email;
    } else {
      data.email = normalizedEmail;
    }
  }

  // ---- Load the existing lead (if any) so this turn's delta merges with prior
  // turns instead of overwriting already-known fields with null. ----
  let existingLead: ExistingLeadRow | null = null;
  let existingLeadFound = false;
  let existingLeadSameCompany = false;
  if (args.leadId) {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select(
        "name, email, phone, property_type, location, object_desc, motivation, ownership_status, usage_type, budget, asking_price, financing, timeframe, move_in_date, company_id, intent, status, ai_summary, next_action, qualification_summary",
      )
      .eq("id", args.leadId)
      .maybeSingle();
    if (existing) {
      existingLeadFound = true;
      existingLeadSameCompany = existing.company_id === args.companyId;
      if (existingLeadSameCompany) existingLead = existing as unknown as ExistingLeadRow;
    }
  }

  const merged = Object.fromEntries(
    MERGE_FIELDS.map((field) => [field, data[field] ?? existingLead?.[field] ?? null]),
  ) as Record<MergeField, string | null>;

  const ALLOWED_INTENTS = ["kauf", "miete", "verkauf", "bewertung", "sonstiges"] as const;
  const intent: LeadIntent | "unbekannt" =
    data.intent && (ALLOWED_INTENTS as readonly string[]).includes(data.intent)
      ? (data.intent as LeadIntent)
      : ((existingLead?.intent as LeadIntent | "unbekannt" | null) ?? "unbekannt");
  const ALLOWED_STATUS = ["neu", "qualifiziert", "termin"] as const;
  const status =
    data._status && (ALLOWED_STATUS as readonly string[]).includes(data._status)
      ? data._status
      : (existingLead?.status ?? "neu");

  const score = scoreFromData({
    ...merged,
    intent: intent as LeadIntent,
    _score: data._score,
    _score_num: data._score_num,
  } as ExtractedData);

  const payload = {
    company_id: args.companyId,
    ...merged,
    intent: intent as never,
    score: score.label,
    score_numeric: score.num,
    status,
    ai_summary: data._summary ?? existingLead?.ai_summary ?? null,
    next_action: data._next_action ?? existingLead?.next_action ?? null,
    qualification_summary:
      data._summary ??
      existingLead?.qualification_summary ??
      transcript.slice(-2).map((t) => `${t.role}: ${t.content}`).join(" · ").slice(0, 280),
    messages: transcript as unknown as never,
  };

  let finalLeadId: string | null = null;
  if (args.leadId && existingLeadFound && !existingLeadSameCompany) {
    console.warn("[widget] leadId belongs to different company — inserting new lead instead");
    const ins = await supabaseAdmin.from("leads").insert(payload).select("id").maybeSingle();
    finalLeadId = ins.data?.id ?? null;
  } else if (args.leadId) {
    await supabaseAdmin.from("leads").upsert({ id: args.leadId, ...payload });
    finalLeadId = args.leadId;
  } else {
    const ins = await supabaseAdmin.from("leads").insert(payload).select("id").maybeSingle();
    finalLeadId = ins.data?.id ?? null;
  }

  // ---- Auto-generate structured Lead-Summary once conversation is meaningful ----
  const userMsgCount = args.messages.filter((m) => m.role === "user").length;
  const hasContact = Boolean(merged.name || merged.email || merged.phone);
  if (finalLeadId && userMsgCount >= 3 && hasContact) {
    try {
      const key = process.env.ANTHROPIC_API_KEY;
      if (key) {
        const { generateLeadSummaryFromTranscript, summaryToLeadUpdate } = await import(
          "@/lib/lead-summary.server"
        );
        const summary = await generateLeadSummaryFromTranscript(transcript, key);
        await supabaseAdmin.from("leads").update(summaryToLeadUpdate(summary)).eq("id", finalLeadId);
        console.log("[widget] structured lead summary generated", { leadId: finalLeadId });
      }
    } catch (err) {
      console.error("[widget] auto-summary error", err);
    }
  }
}
