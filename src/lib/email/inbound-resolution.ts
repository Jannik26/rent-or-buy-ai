// Server-side inbound conversation resolution (Product Track slice 8B,
// see ROADMAP.md) — the ONLY place an inbound webhook's reply token turns
// into a conversation/company/lead. The webhook payload itself never
// supplies company_id, lead_id, or conversation_id as trusted values
// (task Phase 4) — every one of those is re-derived here, server-side,
// from the verified token's conversationId, exactly the same
// "server-derives-tenant" discipline as every other write path in this
// codebase (appointments/messages/conversation_followups triggers).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyReplyToken } from "@/lib/email/reply-token";

export type ResolvedInboundConversation = {
  conversationId: string;
  companyId: string;
  leadId: string;
  leadEmail: string | null;
  conversationStatus: string;
};

export type ResolveInboundConversationResult =
  | { ok: true; conversation: ResolvedInboundConversation }
  | { ok: false; reason: "invalid_token" | "conversation_not_found" | "lead_not_found" };

export async function resolveInboundConversation(
  client: SupabaseClient<Database>,
  args: { token: string; secret: string },
): Promise<ResolveInboundConversationResult> {
  const tokenResult = verifyReplyToken(args.token, args.secret);
  if (!tokenResult.ok) {
    return { ok: false, reason: "invalid_token" };
  }

  // The token's conversationId is the ONLY thing trusted from the inbound
  // address — company_id/lead_id are read from the conversation row
  // itself below, never taken from the token or the payload.
  const { data: conversation, error: convError } = await client
    .from("conversations")
    .select("id, company_id, lead_id, status")
    .eq("id", tokenResult.payload.conversationId)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, email")
    .eq("id", conversation.lead_id)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) {
    return { ok: false, reason: "lead_not_found" };
  }

  return {
    ok: true,
    conversation: {
      conversationId: conversation.id,
      companyId: conversation.company_id,
      leadId: lead.id,
      leadEmail: lead.email,
      conversationStatus: conversation.status,
    },
  };
}
