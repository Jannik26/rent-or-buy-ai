// Real-DB integration test for the Automated Lead Follow-ups engine
// (Product Track slice 5, see ROADMAP.md) — exercises the actual functions
// (not a re-implementation) against the real, connected Supabase project,
// using clearly-tagged, self-cleaning fixture data. Never touches any real
// customer/lead/company data (its own fixture company/lead/conversation
// rows, fixed `f0110001-...`-prefixed ids so they're unambiguous and never
// collide with `gen_random_uuid()`-generated real rows or any other
// fixture namespace already in use — see tests/e2e/fixtures-data.ts's
// `e2e...` prefix and supabase/tests/*_rls.sql's `99999999-...` prefix).
//
// Skipped entirely (not failed) when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// aren't present in the environment — plain `npm test` never has them (see
// vitest.config.ts, no env-file loading configured there on purpose, same
// as every other unit test file staying credential-free). Run this file
// specifically with credentials loaded to actually exercise it:
//   node --env-file-if-exists=.env node_modules/.bin/vitest run src/lib/followups/followups.integration.test.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelOpenFollowupsOnLeadReply,
  ensureFollowupsForConversation,
  handleFollowupsAfterMessages,
  processDueFollowups,
} from "./followups.functions";
import {
  appendMessages,
  findOrCreateConversation,
} from "@/lib/conversations/conversations.functions";
import { getFollowupTemplate } from "./followup-rules";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Same dedicated QA/E2E tenant tests/e2e/fixtures-data.ts already uses —
// never a real customer's company.
const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";

const FIXTURE = {
  leadA: "f0110001-0000-0000-0000-000000000001",
  leadB: "f0110001-0000-0000-0000-000000000002",
  leadC: "f0110001-0000-0000-0000-000000000003",
};

describe.skipIf(!hasCredentials)(
  "processDueFollowups / ensureFollowupsForConversation (real DB)",
  () => {
    let admin: SupabaseClient<Database>;

    beforeAll(() => {
      admin = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
    });

    afterAll(async () => {
      // conversation_followups/messages cascade-delete via conversations,
      // which cascade-deletes via leads — one delete per fixture lead is
      // enough, but conversations/messages are deleted explicitly first too
      // (same "don't rely solely on cascade" convention as
      // tests/e2e/fixtures-data.ts).
      for (const leadId of [FIXTURE.leadA, FIXTURE.leadB, FIXTURE.leadC]) {
        const { data: conv } = await admin
          .from("conversations")
          .select("id")
          .eq("lead_id", leadId)
          .maybeSingle();
        if (conv) {
          await admin.from("conversation_followups").delete().eq("conversation_id", conv.id);
          await admin.from("messages").delete().eq("conversation_id", conv.id);
          await admin.from("conversations").delete().eq("id", conv.id);
        }
        await admin.from("leads").delete().eq("id", leadId);
      }
    });

    it("schedules 3 steps, sends the one that's due, is idempotent on a second run, and leaves the rest untouched", async () => {
      // ---- 1. Fixture lead + conversation ----
      await admin.from("leads").upsert({
        id: FIXTURE.leadA,
        company_id: QA_COMPANY_ID,
        name: "Followup IT Fixture A",
        status: "neu",
      });
      const conversationId = await findOrCreateConversation(admin, {
        leadId: FIXTURE.leadA,
        companyId: QA_COMPANY_ID,
      });

      // ---- 2. Canonical AI message (the "origin" turn) ----
      await appendMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        messages: [
          { senderType: "lead", content: "Ich interessiere mich für eine Wohnung." },
          { senderType: "ai", content: "Gerne, wo darf es sein?" },
        ],
      });

      const { count: messageCountBefore } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);

      // ---- 3. Plan the follow-up sequence ----
      // Real "now", not a fixed past date — steps 2/3 must land genuinely
      // in the future so only the backdated step 1 (below) is actually due
      // when the worker runs.
      const originAt = new Date();
      await ensureFollowupsForConversation(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        originAt,
      });

      const { data: scheduled } = await admin
        .from("conversation_followups")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("step", { ascending: true });
      expect(scheduled).toHaveLength(3);
      expect(scheduled!.map((r) => r.step)).toEqual([1, 2, 3]);
      expect(scheduled!.every((r) => r.status === "scheduled")).toBe(true);
      // Staggered, strictly increasing scheduled_for.
      expect(new Date(scheduled![0].scheduled_for).getTime()).toBeLessThan(
        new Date(scheduled![1].scheduled_for).getTime(),
      );
      expect(new Date(scheduled![1].scheduled_for).getTime()).toBeLessThan(
        new Date(scheduled![2].scheduled_for).getTime(),
      );

      // Calling it again must be a no-op (idempotent scheduling) — still
      // exactly 3 rows, not 6.
      await ensureFollowupsForConversation(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        originAt,
      });
      const { count: followupCountAfterSecondEnsure } = await admin
        .from("conversation_followups")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      expect(followupCountAfterSecondEnsure).toBe(3);

      // ---- 4. Make step 1 due (backdate it — this is fixture-only DB
      // manipulation, not something app code ever does at runtime) ----
      const step1Id = scheduled!.find((r) => r.step === 1)!.id;
      await admin
        .from("conversation_followups")
        .update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", step1Id);

      // ---- 5. Run the worker ----
      const firstRun = await processDueFollowups(admin, { now: new Date() });
      expect(firstRun.claimed).toBe(1);
      expect(firstRun.sent).toBe(1);
      expect(firstRun.cancelled).toBe(0);
      expect(firstRun.failed).toBe(0);

      // ---- 6/7. Exactly one new message, correct content/sequence ----
      const { data: messagesAfter, count: messageCountAfter } = await admin
        .from("messages")
        .select("*", { count: "exact" })
        .eq("conversation_id", conversationId)
        .order("sequence", { ascending: true });
      expect(messageCountAfter).toBe((messageCountBefore ?? 0) + 1);
      const lastMessage = messagesAfter![messagesAfter!.length - 1];
      expect(lastMessage.sender_type).toBe("ai");
      expect(lastMessage.content).toBe(getFollowupTemplate(1));
      expect(lastMessage.sequence).toBe(messageCountBefore ?? 0); // 0-based, so equals the prior count

      // ---- 8. Follow-up status sent ----
      const { data: step1After } = await admin
        .from("conversation_followups")
        .select("*")
        .eq("id", step1Id)
        .single();
      expect(step1After!.status).toBe("sent");
      expect(step1After!.sent_at).not.toBeNull();
      expect(step1After!.message_id).toBe(lastMessage.id);

      // Steps 2/3 are untouched — still scheduled, not due yet.
      const { data: stillScheduled } = await admin
        .from("conversation_followups")
        .select("step, status")
        .eq("conversation_id", conversationId)
        .in("step", [2, 3]);
      expect(stillScheduled!.every((r) => r.status === "scheduled")).toBe(true);

      // ---- 9/10. Running the worker again claims nothing more (step 1 is no
      // longer 'scheduled', steps 2/3 aren't due yet) — no second message. ----
      const secondRun = await processDueFollowups(admin, { now: new Date() });
      expect(secondRun.claimed).toBe(0);
      const { count: messageCountAfterSecondRun } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      expect(messageCountAfterSecondRun).toBe(messageCountAfter);
    }, 20_000); // several real network round trips against the live DB

    it("a lead reply cancels open follow-ups proactively, and the worker's own re-check catches it too if the proactive cancel is skipped", async () => {
      await admin.from("leads").upsert({
        id: FIXTURE.leadB,
        company_id: QA_COMPANY_ID,
        name: "Followup IT Fixture B",
        status: "neu",
      });
      const conversationId = await findOrCreateConversation(admin, {
        leadId: FIXTURE.leadB,
        companyId: QA_COMPANY_ID,
      });
      await appendMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        messages: [
          { senderType: "lead", content: "Erste Nachricht." },
          { senderType: "ai", content: "Antwort darauf." },
        ],
      });
      await ensureFollowupsForConversation(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        originAt: new Date(),
      });

      // Proactive path: the lead replies, widget.chat.ts would call this
      // immediately (see handleFollowupsAfterMessages).
      await appendMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        messages: [{ senderType: "lead", content: "Ich habe doch noch eine Frage." }],
      });
      await cancelOpenFollowupsOnLeadReply(admin, { conversationId });

      const { data: afterProactiveCancel } = await admin
        .from("conversation_followups")
        .select("step, status, skip_reason")
        .eq("conversation_id", conversationId)
        .order("step", { ascending: true });
      expect(afterProactiveCancel!.every((r) => r.status === "cancelled")).toBe(true);
      expect(afterProactiveCancel!.every((r) => r.skip_reason === "lead_replied")).toBe(true);

      // Even if a worker run were somehow triggered after this, there is
      // nothing left in 'scheduled' state for it to claim.
      const runAfterCancel = await processDueFollowups(admin, { now: new Date() });
      expect(runAfterCancel.claimed).toBe(0);

      const { count: messageCountAfterCancel } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);

      // Defense-in-depth: simulate the proactive cancel having been skipped
      // by manually reverting one row back to 'scheduled' and due — the
      // worker must still self-abort via the after_sequence re-check (task
      // section 10: "Regeln erneut prüfen"), not send a stale follow-up.
      const revertedStep = afterProactiveCancel!.find((r) => r.step === 1)!;
      await admin
        .from("conversation_followups")
        .update({
          status: "scheduled",
          scheduled_for: new Date(Date.now() - 60_000).toISOString(),
          cancelled_at: null,
          skip_reason: null,
        })
        .eq("conversation_id", conversationId)
        .eq("step", revertedStep.step);

      const defenseRun = await processDueFollowups(admin, { now: new Date() });
      expect(defenseRun.claimed).toBe(1);
      expect(defenseRun.sent).toBe(0);
      expect(defenseRun.cancelled).toBe(1);

      const { data: revertedAfter } = await admin
        .from("conversation_followups")
        .select("status, skip_reason")
        .eq("conversation_id", conversationId)
        .eq("step", revertedStep.step)
        .single();
      expect(revertedAfter!.status).toBe("cancelled");
      expect(revertedAfter!.skip_reason).toBe("lead_replied");

      // Still no follow-up-authored message was ever created.
      const { count: messageCountFinal } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      expect(messageCountFinal).toBe(messageCountAfterCancel);
    });

    it("handleFollowupsAfterMessages (the exact call widget.chat.ts makes) schedules on an AI turn and cancels on a lead turn in the same call", async () => {
      await admin.from("leads").upsert({
        id: FIXTURE.leadC,
        company_id: QA_COMPANY_ID,
        name: "Followup IT Fixture C",
        status: "neu",
      });
      const conversationId = await findOrCreateConversation(admin, {
        leadId: FIXTURE.leadC,
        companyId: QA_COMPANY_ID,
      });
      await appendMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        messages: [
          { senderType: "lead", content: "Erstkontakt." },
          { senderType: "ai", content: "Erste Antwort." },
        ],
      });

      // First turn: only an 'ai' message was newly appended (as far as this
      // call is concerned) — schedules the sequence.
      await handleFollowupsAfterMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        appendedSenderTypes: ["ai"],
      });
      const { count: countAfterFirstCall } = await admin
        .from("conversation_followups")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      expect(countAfterFirstCall).toBe(3);

      // Second (real widget) turn: both a 'lead' and an 'ai' message
      // appended in the same call — must cancel the still-open sequence
      // (lead replied) and must NOT schedule a second one (lifetime cap).
      await appendMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        messages: [
          { senderType: "lead", content: "Noch eine Frage." },
          { senderType: "ai", content: "Zweite Antwort." },
        ],
      });
      await handleFollowupsAfterMessages(admin, {
        conversationId,
        companyId: QA_COMPANY_ID,
        appendedSenderTypes: ["lead", "ai"],
      });

      const { data: rowsAfterSecondCall } = await admin
        .from("conversation_followups")
        .select("status")
        .eq("conversation_id", conversationId);
      expect(rowsAfterSecondCall).toHaveLength(3); // still the lifetime cap of 3, not 6
      expect(rowsAfterSecondCall!.every((r) => r.status === "cancelled")).toBe(true);
    });
  },
);
