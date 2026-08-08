// Real-DB integration tests for the production follow-up worker (Product
// Track slice 6, see ROADMAP.md) — calls the real route handler
// (handleFollowupWorkerRequest) with constructed Request objects against
// the real, connected Supabase project. No actual HTTP server is spun up
// (TanStack Start's request dispatch layer is bypassed), but every DB call
// inside the handler is 100% real — the same pattern
// src/lib/followups/followups.integration.test.ts already established for
// Slice 5's engine-level functions.
//
// Skipped entirely (not failed) without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// — same convention as every other integration test in this repo. Run with:
//   node --env-file-if-exists=.env node_modules/.bin/vitest run src/routes/api/internal/followups.process.integration.test.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleFollowupWorkerRequest } from "./followups.process";
import {
  appendMessages,
  findOrCreateConversation,
} from "@/lib/conversations/conversations.functions";
import {
  ensureFollowupsForConversation,
  processDueFollowups,
  recoverStaleProcessingFollowups,
  type FollowupDeliveryAdapter,
} from "@/lib/followups/followups.functions";
import { getFollowupTemplate } from "@/lib/followups/followup-rules";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";
const TEST_SECRET = "test-only-cron-secret-slice-6";

// Own fixture-id range — f0120001-... — deliberately disjoint from Slice 5's
// f0110001-... range so the two integration test files never collide even
// if run concurrently.
const FIXTURE = {
  leadDue: "f0120001-0000-0000-0000-000000000001",
  leadConcurrent: "f0120001-0000-0000-0000-000000000002",
  leadLeadReplyRace: "f0120001-0000-0000-0000-000000000003",
  leadClosedConversation: "f0120001-0000-0000-0000-000000000004",
  leadAuthFailure: "f0120001-0000-0000-0000-000000000005",
  leadDeliveryFailure: "f0120001-0000-0000-0000-000000000006",
  leadStaleProcessing: "f0120001-0000-0000-0000-000000000007",
  leadStaleAlreadySent: "f0120001-0000-0000-0000-000000000008",
  leadWorkerDisabled: "f0120001-0000-0000-0000-000000000009",
} as const;

function authorizedRequest(): Request {
  return new Request("https://example.com/api/internal/followups/process", {
    headers: { authorization: `Bearer ${TEST_SECRET}` },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A real (not simulated) 3s wait, paired with a ~0.6s staleness threshold
 * — comfortably larger than any reasonable clock skew between this test
 * process and the Supabase Postgres server, which is what actually matters
 * here: `isStaleProcessing` compares a CLIENT-computed `now` against a
 * SERVER-computed `updated_at` (stamped by the conversation_followups_updated
 * trigger's own `now()`), so a `staleAfterMinutes: 0` threshold is not
 * reliable — clock skew alone can put `updated_at` fractionally ahead of
 * the client's `now`, making the row look *not* stale. */
const STALE_TEST_THRESHOLD_MINUTES = 0.01; // ~0.6s
const STALE_TEST_WAIT_MS = 3_000;

async function seedDueFollowup(
  admin: SupabaseClient<Database>,
  leadId: string,
  name: string,
): Promise<{ conversationId: string; followupId: string }> {
  await admin.from("leads").upsert({ id: leadId, company_id: QA_COMPANY_ID, name, status: "neu" });
  const conversationId = await findOrCreateConversation(admin, {
    leadId,
    companyId: QA_COMPANY_ID,
  });
  await appendMessages(admin, {
    conversationId,
    companyId: QA_COMPANY_ID,
    messages: [
      { senderType: "lead", content: "Erstkontakt." },
      { senderType: "ai", content: "Antwort darauf." },
    ],
  });
  await ensureFollowupsForConversation(admin, {
    conversationId,
    companyId: QA_COMPANY_ID,
    originAt: new Date(),
  });
  const { data: step1 } = await admin
    .from("conversation_followups")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("step", 1)
    .single();
  await admin
    .from("conversation_followups")
    .update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", step1!.id);
  return { conversationId, followupId: step1!.id };
}

describe.skipIf(!hasCredentials)("production follow-up worker route (real DB)", () => {
  let admin: SupabaseClient<Database>;
  const seededLeadIds = new Set<string>(Object.values(FIXTURE));

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    // Every test that touches the kill switch must restore it — belt and
    // braces in case a test fails before its own finally block runs.
    delete process.env.FOLLOWUP_WORKER_ENABLED;
  });

  afterAll(async () => {
    delete process.env.CRON_SECRET;
    for (const leadId of seededLeadIds) {
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

  // ---- Scenario 1 + 2: due follow-up, then idempotent re-run ----
  it("scenario 1+2: sends exactly one due follow-up, and a second call sends nothing more", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadDue,
      "Worker Due Fixture",
    );

    const res1 = await handleFollowupWorkerRequest(authorizedRequest());
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { claimed: number; sent: number; runId: string };
    expect(body1.claimed).toBe(1);
    expect(body1.sent).toBe(1);
    expect(body1.runId).toBeTruthy();

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, message_id")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("sent");
    expect(followupAfter!.message_id).not.toBeNull();

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(3); // 2 origin + 1 follow-up

    // Scenario 2 — idempotency via the real route a second time.
    const res2 = await handleFollowupWorkerRequest(authorizedRequest());
    const body2 = (await res2.json()) as { claimed: number };
    expect(body2.claimed).toBe(0);

    const { count: messageCountAfterSecondRun } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCountAfterSecondRun).toBe(3);
  }, 20_000);

  // ---- Scenario 3: two concurrent invocations against the same due row ----
  it("scenario 3: two concurrent worker calls never both send the same follow-up", async () => {
    const { conversationId } = await seedDueFollowup(
      admin,
      FIXTURE.leadConcurrent,
      "Worker Concurrent Fixture",
    );

    const [res1, res2] = await Promise.all([
      handleFollowupWorkerRequest(authorizedRequest()),
      handleFollowupWorkerRequest(authorizedRequest()),
    ]);
    const [body1, body2] = (await Promise.all([res1.json(), res2.json()])) as {
      claimed: number;
      sent: number;
    }[];

    // Exactly one of the two calls could have claimed the row (or,
    // depending on timing, one claims it and the other finds nothing) —
    // across BOTH calls combined, the row was claimed exactly once.
    expect(body1.claimed + body2.claimed).toBe(1);
    expect(body1.sent + body2.sent).toBe(1);

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(3); // 2 origin + exactly 1 follow-up, never 2

    const { data: followups } = await admin
      .from("conversation_followups")
      .select("step, status")
      .eq("conversation_id", conversationId)
      .eq("step", 1);
    expect(followups).toHaveLength(1);
    expect(followups![0].status).toBe("sent");
  }, 20_000);

  // ---- Scenario 4: lead replies before the worker runs (proactive cancel
  // deliberately skipped, to exercise the worker's own defense-in-depth
  // re-check — see followups.functions.ts's recoverStaleProcessingFollowups
  // doc comment for the same pattern applied to stale rows). ----
  it("scenario 4: a lead reply before the worker runs prevents sending, even without the proactive cancel", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadLeadReplyRace,
      "Worker Lead Reply Race Fixture",
    );
    // Simulate the reply arriving without going through
    // handleFollowupsAfterMessages (i.e. the proactive cancel path never
    // fires) — only appendMessages, exactly the race the worker's own
    // re-check exists to catch.
    await appendMessages(admin, {
      conversationId,
      companyId: QA_COMPANY_ID,
      messages: [{ senderType: "lead", content: "Doch noch eine Frage, bevor der Follow-up kam." }],
    });

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { claimed: number; sent: number; cancelled: number };
    expect(body.claimed).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.cancelled).toBe(1);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("cancelled");
    expect(followupAfter!.skip_reason).toBe("lead_replied");
  }, 20_000);

  // ---- Scenario 5: conversation closed before the worker runs ----
  it("scenario 5: a closed conversation prevents sending a due follow-up", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadClosedConversation,
      "Worker Closed Conversation Fixture",
    );
    await admin.from("conversations").update({ status: "closed" }).eq("id", conversationId);

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { claimed: number; sent: number; cancelled: number };
    expect(body.claimed).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.cancelled).toBe(1);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("cancelled");
    expect(followupAfter!.skip_reason).toBe("conversation_closed");
  }, 20_000);

  // ---- Scenario 6: kill switch ----
  it("scenario 6: the kill switch prevents any claim/send and says so in the response", async () => {
    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadWorkerDisabled,
      "Worker Disabled Fixture",
    );
    process.env.FOLLOWUP_WORKER_ENABLED = "false";
    try {
      const res = await handleFollowupWorkerRequest(authorizedRequest());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { disabled: boolean };
      expect(body.disabled).toBe(true);
    } finally {
      delete process.env.FOLLOWUP_WORKER_ENABLED;
    }

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("scheduled"); // completely untouched

    // Cleanup: this row is deliberately left 'scheduled' AND due (that's
    // the point of the assertion above) — cancel it now so it can't leak
    // into a later test's *global*, non-conversation-scoped
    // processDueFollowups/recovery call (those intentionally process
    // every currently-due row in the whole table, not just one fixture's).
    await admin.from("conversation_followups").update({ status: "cancelled" }).eq("id", followupId);
  }, 20_000);

  // ---- Scenario 7: auth failure ----
  it("scenario 7: a missing/wrong secret is rejected and never touches the DB", async () => {
    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadAuthFailure,
      "Worker Auth Fixture",
    );

    const noAuth = await handleFollowupWorkerRequest(
      new Request("https://example.com/api/internal/followups/process"),
    );
    expect(noAuth.status).toBe(401);

    const wrongAuth = await handleFollowupWorkerRequest(
      new Request("https://example.com/api/internal/followups/process", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(wrongAuth.status).toBe(401);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("scheduled"); // never claimed

    // Same leak-prevention cleanup as scenario 6 — see its comment.
    await admin.from("conversation_followups").update({ status: "cancelled" }).eq("id", followupId);
  }, 20_000);

  // ---- Scenario 8: delivery failure (tested at the processDueFollowups
  // level directly — the production route deliberately accepts no adapter
  // override, see task section 14's "no endpoint parameters" requirement,
  // so this is the correct place to exercise a failing adapter). ----
  it("scenario 8: a failing delivery adapter lands the follow-up in failed, not stuck in processing", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadDeliveryFailure,
      "Worker Delivery Failure Fixture",
    );
    const alwaysFailingAdapter: FollowupDeliveryAdapter = {
      async deliver() {
        return { delivered: false, errorCode: "simulated_delivery_failure" };
      },
    };

    const result = await processDueFollowups(admin, {
      now: new Date(),
      adapter: alwaysFailingAdapter,
    });
    expect(result.claimed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, failed_at, error_code")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("failed");
    expect(followupAfter!.failed_at).not.toBeNull();
    expect(followupAfter!.error_code).toBe("simulated_delivery_failure");

    // No message was created for the failed step.
    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(2); // only the 2 origin messages
  }, 20_000);

  // ---- Scenario 9: stale processing recovery, both outcomes ----
  //
  // Tested by calling recoverStaleProcessingFollowups directly (like
  // scenario 8, not through the route): conversation_followups_updated
  // (the same trigger that stamps every status transition) unconditionally
  // overwrites `updated_at` to `now()` on every UPDATE, including a test's
  // own attempt to backdate it — so a "genuinely old" processing row can't
  // be constructed through the route's env-configured (whole-minute)
  // threshold without actually waiting minutes of real wall-clock time.
  // Passing an explicit near-zero `staleAfterMinutes` directly to the
  // function (not gated by the route's parsePositiveIntEnv, which
  // correctly rejects 0 as a batch size but isn't in play here) reproduces
  // the exact same "processing row older than the threshold" condition
  // using only the real DB round-trip latency between the UPDATE above and
  // the recovery check below — still fully real, no mocked time.
  it("scenario 9a: a stale processing row with no matching message is recovered back to scheduled, then sent normally", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadStaleProcessing,
      "Worker Stale Processing Fixture",
    );
    // Simulate an abandoned run: claimed (processing), never reached a
    // terminal status.
    await admin
      .from("conversation_followups")
      .update({ status: "processing" })
      .eq("id", followupId);
    await sleep(STALE_TEST_WAIT_MS);

    const recovery = await recoverStaleProcessingFollowups(admin, {
      staleAfterMinutes: STALE_TEST_THRESHOLD_MINUTES,
    });
    expect(recovery.recovered).toBeGreaterThanOrEqual(1);
    expect(recovery.resetToScheduled).toBeGreaterThanOrEqual(1);

    const { data: afterRecovery } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", followupId)
      .single();
    expect(afterRecovery!.status).toBe("scheduled");

    // Recovered to 'scheduled' — and it's also still due (scheduled_for
    // is in the past), so a normal worker pass now sends it — no
    // follow-up is permanently lost to a crash.
    const result = await processDueFollowups(admin, { now: new Date() });
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const { data: finalRow } = await admin
      .from("conversation_followups")
      .select("status, message_id")
      .eq("id", followupId)
      .single();
    expect(finalRow!.status).toBe("sent");
    expect(finalRow!.message_id).not.toBeNull();

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(3); // exactly one follow-up message, not zero, not two
  }, 20_000);

  it("scenario 9b: a stale processing row whose message WAS already created is reconciled to sent, never resent", async () => {
    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadStaleAlreadySent,
      "Worker Stale Already Sent Fixture",
    );
    // Simulate the exact crash window this recovery exists for: the
    // delivery insert succeeded, but the runtime died before the status
    // update that would have marked the row 'sent'.
    const inserted = await appendMessages(admin, {
      conversationId,
      companyId: QA_COMPANY_ID,
      messages: [{ senderType: "ai", content: getFollowupTemplate(1) }],
    });
    await admin
      .from("conversation_followups")
      .update({ status: "processing" })
      .eq("id", followupId);
    await sleep(STALE_TEST_WAIT_MS);

    const recovery = await recoverStaleProcessingFollowups(admin, {
      staleAfterMinutes: STALE_TEST_THRESHOLD_MINUTES,
    });
    expect(recovery.recovered).toBeGreaterThanOrEqual(1);
    expect(recovery.reconciledAsSent).toBeGreaterThanOrEqual(1);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, message_id")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("sent");
    expect(followupAfter!.message_id).toBe(inserted[0].id);

    // A normal worker pass afterward must claim nothing more for this row.
    await processDueFollowups(admin, { now: new Date() });
    const { data: unclaimedCheck } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", followupId)
      .single();
    expect(unclaimedCheck!.status).toBe("sent"); // untouched by the follow-up pass

    // Still exactly one follow-up message — reconciliation must never
    // create a second one.
    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("content", getFollowupTemplate(1));
    expect(messageCount).toBe(1);
  }, 20_000);
});
