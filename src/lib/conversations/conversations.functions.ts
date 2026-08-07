// Central Conversations V1 data layer. Follows the same createServerFn +
// requireSupabaseAuth pattern as appointments.functions.ts /
// analytics.functions.ts: `context.supabase` is bound to the caller's own
// JWT (RLS-enforced, not service role) — tenant isolation is the existing
// "Owner reads leads" RLS policy on `leads`, nothing new, no company_id
// trusted from anywhere.
//
// Deliberately NOT a new SQL function/migration (unlike appointments'
// tg_set_appointment_company or analytics_summary): this endpoint only
// ever touches the current tenant's own, already-small lead set (the
// existing `leads_company_idx (company_id, created_at DESC)` index already
// makes the RLS-filtered fetch cheap), and the derived fields
// (message count, last message, preview) are trivial to compute in JS
// server-side. The full `messages` JSONB is fetched from Postgres for the
// list — no way around that without a dedicated projection function — but
// it is stripped down to id/name/status/score/count/preview/activity
// before this function's response leaves the server, so the client never
// receives more than a small, non-PII-heavy summary. Documented as a V1
// pragmatic choice, not a performance-blind one — see ROADMAP.md's
// tech-debt entry if list sizes ever grow enough to matter.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getConversationActivityAt,
  getLastMessage,
  normalizeMessages,
  sortConversationsByActivity,
  truncatePreview,
  type NormalizedMessage,
} from "@/lib/conversations/conversation-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConversationListItem = {
  leadId: string;
  name: string | null;
  status: string;
  score: string;
  scoreNumeric: number;
  intent: string;
  messageCount: number;
  lastMessageRole: NormalizedMessage["role"] | null;
  lastMessagePreview: string;
  /** See getConversationActivityAt's doc comment — leads.updated_at, an
   * approximation of "last message time", not a true one (messages carry
   * no timestamp of their own in this schema). */
  activityAt: string;
};

const LIST_COLUMNS = "id, name, status, score, score_numeric, intent, messages, updated_at";

/**
 * Only leads that actually have at least one message are "conversations" —
 * a lead with an empty `messages` array has nothing to show here (see
 * ROADMAP.md: this is the same distinction the appointments slice already
 * draws between real data and an empty/legacy shape, applied to
 * conversations instead of appointments).
 */
export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationListItem[]> => {
    const { supabase } = context;
    const { data, error } = await supabase.from("leads").select(LIST_COLUMNS);
    if (error) throw new Error(error.message);

    const items: ConversationListItem[] = [];
    for (const lead of data ?? []) {
      const messages = normalizeMessages(lead.messages);
      if (messages.length === 0) continue;
      const last = getLastMessage(messages);
      items.push({
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        score: lead.score,
        scoreNumeric: lead.score_numeric,
        intent: lead.intent,
        messageCount: messages.length,
        lastMessageRole: last?.role ?? null,
        lastMessagePreview: truncatePreview(last?.content ?? ""),
        activityAt: getConversationActivityAt(lead.updated_at),
      });
    }
    return sortConversationsByActivity(items);
  });

export type ConversationDetail = {
  leadId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  score: string;
  scoreNumeric: number;
  intent: string;
  createdAt: string;
  updatedAt: string;
  messages: NormalizedMessage[];
};

const DETAIL_COLUMNS =
  "id, name, email, phone, status, score, score_numeric, intent, messages, created_at, updated_at";

export const getConversationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }): Promise<ConversationDetail | null> => {
    const { supabase } = context;
    // No explicit ownership check needed beyond RLS: a foreign leadId
    // simply yields no row here (RLS "Owner reads leads"), same pattern as
    // getLeadAppointments in appointments.functions.ts.
    const { data: lead, error } = await supabase
      .from("leads")
      .select(DETAIL_COLUMNS)
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) return null;
    return {
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      score: lead.score,
      scoreNumeric: lead.score_numeric,
      intent: lead.intent,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      messages: normalizeMessages(lead.messages),
    };
  });
