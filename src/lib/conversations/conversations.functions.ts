// Central Conversations data layer — canonical `conversations`/`messages`
// tables (see 20260808014256_add_canonical_conversations.sql and
// ROADMAP.md's Conversations Foundation entry), replacing the old
// `leads.messages` JSONB reads Conversations V1 used.
//
// Two different privilege levels live in this one file, both exported as
// plain functions that take a Supabase client as a parameter rather than
// importing one themselves:
//   - getConversations / getConversationDetail are wrapped in createServerFn
//     + requireSupabaseAuth (below), exactly like appointments.functions.ts
//     / analytics.functions.ts: `context.supabase` is bound to the caller's
//     own JWT (RLS-enforced, NOT service role) — tenant isolation is the
//     existing owner-scoped RLS policies on conversations/messages, nothing
//     new, no company_id trusted from anywhere. This is the ONLY way the
//     dashboard reads this data — no service-role bypass for normal
//     dashboard usage.
//   - findOrCreateConversation / appendMessages / syncCanonicalConversation
//     are plain exported functions, deliberately NOT createServerFns and
//     deliberately NOT importing supabaseAdmin themselves: this file is a
//     `*.functions.ts` module, which (per this repo's existing convention,
//     see client.server.ts's own comment) ships to the client bundle, so it
//     must never import the service-role client at its top level. Instead,
//     callers that need service-role writes (today: only
//     widget.chat.ts, an anonymous-visitor write path that already used
//     supabaseAdmin for leads.messages before this slice — not a new
//     bypass) pass their own client in explicitly. A future authenticated,
//     owner-scoped writer (e.g. a Makler replying inline — not built in
//     this slice) would pass its own RLS-bound `context.supabase` instead,
//     and get the exact same tenant-safety guarantees reads already have.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  computeNewTranscriptTurns,
  mapTranscriptRoleToSenderType,
  sortConversationsByActivity,
  truncatePreview,
  type CanonicalMessage,
  type MessageSenderType,
  type TranscriptTurn,
} from "@/lib/conversations/conversation-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only channel any write path produces today — see the migration and
 * ROADMAP.md's Omnichannel section for how future channels slot in without
 * a schema change. Centralized here so a future channel literal isn't
 * hand-typed in more than one place. */
const WEBSITE_CHANNEL = "website";

// ============================================================================
// Reads — authenticated, RLS-bound, dashboard-facing.
// ============================================================================

export type ConversationListItem = {
  leadId: string;
  name: string | null;
  status: string;
  score: string;
  scoreNumeric: number;
  intent: string;
  messageCount: number;
  lastMessageSenderType: MessageSenderType | null;
  lastMessagePreview: string;
  /** `conversations.last_message_at` — see conversation-rules.ts's
   * ConversationSummary doc comment. Null only for the (currently
   * unreachable in practice) case of a conversation row with zero
   * messages. */
  activityAt: string | null;
};

const LEAD_LIST_COLUMNS = "id, name, status, score, score_numeric, intent";

/**
 * Only leads that have an actual conversation with at least one message
 * show up here — a lead with no chat history yet has nothing to show (same
 * distinction Conversations V1 already drew, applied to the new tables).
 *
 * Two queries, not N+1: `leads` for the tenant's own leads (owner-scoped
 * RLS), and one embedded `conversations(...messages(...))` query for every
 * one of that tenant's website conversations plus ALL of their messages —
 * a single round trip regardless of how many conversations/messages exist,
 * joined to the leads in JS below. Fetching every message just to compute a
 * count and take the last one is the same pragmatic V1 choice Conversations
 * V1 already made and documented for the old JSONB column — real message
 * volumes here are small (dozens per lead at most), so this isn't a
 * performance-blind decision; see ROADMAP.md if list sizes ever grow enough
 * to justify a dedicated projection/aggregate instead.
 */
export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationListItem[]> => {
    const { supabase } = context;

    const [{ data: leads, error: leadsError }, { data: conversations, error: convError }] =
      await Promise.all([
        supabase.from("leads").select(LEAD_LIST_COLUMNS),
        supabase
          .from("conversations")
          .select("lead_id, last_message_at, messages(sender_type, content, sequence)")
          .eq("channel", WEBSITE_CHANNEL),
      ]);
    if (leadsError) throw new Error(leadsError.message);
    if (convError) throw new Error(convError.message);

    const conversationByLead = new Map((conversations ?? []).map((c) => [c.lead_id, c]));

    const items: ConversationListItem[] = [];
    for (const lead of leads ?? []) {
      const conversation = conversationByLead.get(lead.id);
      const messages = (conversation?.messages ?? [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence);
      if (messages.length === 0) continue;
      const last = messages[messages.length - 1];
      items.push({
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        score: lead.score,
        scoreNumeric: lead.score_numeric,
        intent: lead.intent,
        messageCount: messages.length,
        lastMessageSenderType: (last?.sender_type as MessageSenderType) ?? null,
        lastMessagePreview: truncatePreview(last?.content ?? ""),
        activityAt: conversation?.last_message_at ?? null,
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
  messages: CanonicalMessage[];
};

const LEAD_DETAIL_COLUMNS =
  "id, name, email, phone, status, score, score_numeric, intent, created_at, updated_at";

export const getConversationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }): Promise<ConversationDetail | null> => {
    const { supabase } = context;
    // No explicit ownership check needed beyond RLS: a foreign leadId
    // simply yields no row here (RLS "Owner reads leads"), same pattern as
    // getLeadAppointments in appointments.functions.ts.
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(LEAD_DETAIL_COLUMNS)
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) return null;

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", data.leadId)
      .eq("channel", WEBSITE_CHANNEL)
      .maybeSingle();
    if (convError) throw new Error(convError.message);

    let messages: CanonicalMessage[] = [];
    if (conversation) {
      // Ordered exclusively by `sequence` — never `created_at`, see the
      // migration header (legacy-imported rows share one technical
      // fallback created_at per lead, so it carries no ordering meaning).
      const { data: rows, error: msgError } = await supabase
        .from("messages")
        .select("sender_type, content")
        .eq("conversation_id", conversation.id)
        .order("sequence", { ascending: true });
      if (msgError) throw new Error(msgError.message);
      messages = (rows ?? []).map((m) => ({
        senderType: m.sender_type as MessageSenderType,
        content: m.content,
      }));
    }

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
      messages,
    };
  });

// ============================================================================
// Writes — plain functions, client passed in by the caller (see file header).
// ============================================================================

/**
 * Finds this lead's website conversation, or creates it if this is its
 * first message. Not an upsert: an upsert would also fire on every call
 * even when nothing needs to change, spuriously bumping
 * conversations.updated_at via the update trigger — select-then-insert
 * keeps "nothing to do" actually meaning zero writes. The unique index on
 * (lead_id, channel) is the real safety net for the race between the
 * select and the insert (two concurrent first-turns for the same brand-new
 * lead) — on a conflict there, re-select instead of failing the caller's
 * turn.
 */
export async function findOrCreateConversation(
  client: SupabaseClient<Database>,
  args: { leadId: string; companyId: string; channel?: string },
): Promise<string> {
  const channel = args.channel ?? WEBSITE_CHANNEL;

  const { data: existing, error: selectError } = await client
    .from("conversations")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("channel", channel)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await client
    .from("conversations")
    .insert({ lead_id: args.leadId, company_id: args.companyId, channel })
    .select("id")
    .single();
  if (insertError) {
    const UNIQUE_VIOLATION = "23505";
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      const { data: retried, error: retryError } = await client
        .from("conversations")
        .select("id")
        .eq("lead_id", args.leadId)
        .eq("channel", channel)
        .maybeSingle();
      if (retryError) throw new Error(retryError.message);
      if (retried) return retried.id;
    }
    throw new Error(insertError.message);
  }
  return created.id;
}

/** Appends one or more new messages to a conversation. `sequence` is never
 * passed — the `tg_set_message_sequence` trigger always computes it from
 * existing rows, see the migration. A caller with zero new messages is a
 * no-op, not an error. */
export async function appendMessages(
  client: SupabaseClient<Database>,
  args: {
    conversationId: string;
    companyId: string;
    messages: { senderType: MessageSenderType; content: string }[];
  },
): Promise<void> {
  if (args.messages.length === 0) return;
  const rows = args.messages.map((m) => ({
    conversation_id: args.conversationId,
    company_id: args.companyId,
    sender_type: m.senderType,
    content: m.content,
  }));
  const { error } = await client.from("messages").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * The one call widget.chat.ts needs: given the full turn-by-turn transcript
 * (including this turn's new user message and the assistant reply that was
 * just generated — see computeNewTranscriptTurns's doc comment for why the
 * full transcript, not just the delta, is the right input), finds/creates
 * this lead's website conversation and appends only the messages genuinely
 * new since last time. Messages that map to no known sender type (see
 * mapTranscriptRoleToSenderType) or are empty after trimming are skipped
 * individually rather than failing the whole turn — `messages.content`'s
 * CHECK constraint would reject an empty row anyway, and one odd turn
 * shouldn't take down persistence for the rest of a real conversation.
 */
export async function syncCanonicalConversation(
  client: SupabaseClient<Database>,
  args: { leadId: string; companyId: string; transcript: TranscriptTurn[] },
): Promise<void> {
  const conversationId = await findOrCreateConversation(client, {
    leadId: args.leadId,
    companyId: args.companyId,
  });

  const { count, error: countError } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if (countError) throw new Error(countError.message);

  const newTurns = computeNewTranscriptTurns(args.transcript, count ?? 0);
  const newMessages = newTurns
    .map((turn) => {
      const senderType = mapTranscriptRoleToSenderType(turn.role);
      return senderType ? { senderType, content: turn.content.trim() } : null;
    })
    .filter(
      (m): m is { senderType: MessageSenderType; content: string } =>
        m !== null && m.content !== "",
    );

  await appendMessages(client, {
    conversationId,
    companyId: args.companyId,
    messages: newMessages,
  });
}
