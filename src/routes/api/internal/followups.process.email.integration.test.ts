// Real-DB integration tests for the E-Mail delivery channel (Product Track
// slice 7, see ROADMAP.md) — calls the real route handler
// (handleFollowupWorkerRequest) with EMAIL_DELIVERY_ENABLED and a full
// provider config set, against the real, connected Supabase project. The
// only thing mocked is `fetch` (via vi.stubGlobal) — everything else,
// including selectFollowupDeliveryAdapter's real env-driven decision logic
// and every DB call, is exercised for real, same pattern as
// followups.process.integration.test.ts (Slice 6).
//
// The fetch mock simulates Resend's own idempotency-key behavior (returning
// the SAME provider message id for a repeated call with the same
// Idempotency-Key rather than genuinely re-sending) — this is what actually
// lets the test suite assert "no double external send" without a real
// Resend account.
//
// IMPORTANT: Supabase-js's own PostgREST/GoTrue clients use the global
// `fetch` for every DB call too — vi.stubGlobal("fetch", ...) replaces
// `fetch` for EVERYTHING, not just calls to Resend. The mock below forwards
// any non-Resend URL to the REAL fetch (captured once, before any stubbing)
// or the entire DB layer breaks underneath the test. This was a real bug
// found while writing this file — see ROADMAP.md. Because of this, "how
// many times was Resend actually called" is asserted via the `calls` array
// (Resend-only) returned by createFakeResendFetch, never via the raw
// fetchMock call count (which also counts every passed-through Supabase call).
//
// Skipped entirely (not failed) without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// — same convention as every other integration test in this repo. Run with:
//   node --env-file-if-exists=.env node_modules/.bin/vitest run src/routes/api/internal/followups.process.email.integration.test.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleFollowupWorkerRequest } from "./followups.process";
import {
  appendMessages,
  findOrCreateConversation,
} from "@/lib/conversations/conversations.functions";
import {
  ensureFollowupsForConversation,
  recoverStaleProcessingFollowups,
} from "@/lib/followups/followups.functions";
import { createEmailDeliveryAdapter } from "@/lib/followups/email-delivery-adapter";
import { createResendEmailProvider } from "@/lib/email/providers/resend-provider";
import { getFollowupTemplate } from "@/lib/followups/followup-rules";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";
const TEST_SECRET = "test-only-cron-secret-slice-7";
const TEST_SENDER_ADDRESS = "follow-up@mail.estateai.de.test";
const TEST_API_KEY = "re_test_only_key_never_real";

// Own fixture-id range — f0130001-... — deliberately disjoint from slice
// 5/6's f0110001-.../f0120001-... ranges.
const FIXTURE = {
  leadSuccess: "f0130001-0000-0000-0000-000000000001",
  leadNoEmail: "f0130001-0000-0000-0000-000000000002",
  leadInvalidEmail: "f0130001-0000-0000-0000-000000000003",
  leadClosedConversation: "f0130001-0000-0000-0000-000000000004",
  leadReply: "f0130001-0000-0000-0000-000000000005",
  leadStopped: "f0130001-0000-0000-0000-000000000006",
  leadProviderFailure: "f0130001-0000-0000-0000-000000000007",
  leadWorkerRetryDoubleClaim: "f0130001-0000-0000-0000-000000000008",
  leadWorkerRetryCrashRecovery: "f0130001-0000-0000-0000-000000000009",
  leadConcurrent: "f0130001-0000-0000-0000-000000000010",
  leadDeliveryDisabled: "f0130001-0000-0000-0000-000000000011",
} as const;

function authorizedRequest(): Request {
  return new Request("https://example.com/api/internal/followups/process", {
    headers: { authorization: `Bearer ${TEST_SECRET}` },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STALE_TEST_THRESHOLD_MINUTES = 0.01; // ~0.6s — see slice 6's integration test for why not 0.
const STALE_TEST_WAIT_MS = 3_000;

async function seedDueFollowup(
  admin: SupabaseClient<Database>,
  leadId: string,
  name: string,
  email: string | null,
): Promise<{ conversationId: string; followupId: string }> {
  await admin
    .from("leads")
    .upsert({ id: leadId, company_id: QA_COMPANY_ID, name, email, status: "neu" });
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

const realFetch = globalThis.fetch;
const RESEND_URL = "https://api.resend.com/emails";

/** Simulates Resend's own documented Idempotency-Key behavior (24h window:
 * the same key returns the original response instead of genuinely sending
 * again). Only intercepts requests to Resend's API; everything else
 * (Supabase) is passed through to the real fetch untouched — see the file
 * header comment for why that matters. `calls` (Resend-only) is what every
 * test asserts call counts against, never the raw mock's total call count. */
function createFakeResendFetch(opts: { failAll?: boolean } = {}) {
  const deliveredKeys = new Map<string, string>(); // idempotencyKey -> providerMessageId
  let nextId = 1;
  const calls: { idempotencyKey: string | null; body: unknown }[] = [];

  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (!urlString.startsWith(RESEND_URL)) {
      return realFetch(url as never, init);
    }

    const headers = init?.headers as Record<string, string> | undefined;
    const idempotencyKey = headers?.["Idempotency-Key"] ?? null;
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ idempotencyKey, body });

    if (opts.failAll) {
      return new Response(
        JSON.stringify({ name: "validation_error", message: "simulated rejection" }),
        {
          status: 422,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (idempotencyKey && deliveredKeys.has(idempotencyKey)) {
      // Real Resend behavior: same key -> same cached response, no new send.
      return new Response(JSON.stringify({ id: deliveredKeys.get(idempotencyKey) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const id = `email_test_${nextId++}`;
    if (idempotencyKey) deliveredKeys.set(idempotencyKey, id);
    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { fetchMock, deliveredKeys, calls };
}

describe.skipIf(!hasCredentials)("E-Mail delivery channel (real DB, mocked provider HTTP)", () => {
  let admin: SupabaseClient<Database>;
  const seededLeadIds = new Set<string>(Object.values(FIXTURE));

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    process.env.CRON_SECRET = TEST_SECRET;
    process.env.EMAIL_DELIVERY_ENABLED = "true";
    process.env.EMAIL_PROVIDER_API_KEY = TEST_API_KEY;
    process.env.EMAIL_SENDER_ADDRESS = TEST_SENDER_ADDRESS;
    process.env.EMAIL_REPLY_TO = TEST_SENDER_ADDRESS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    delete process.env.CRON_SECRET;
    delete process.env.EMAIL_DELIVERY_ENABLED;
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.EMAIL_SENDER_ADDRESS;
    delete process.env.EMAIL_REPLY_TO;
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

  // ---- Scenario 1: successful email follow-up ----
  it("scenario 1: sends exactly one real email attempt, records the canonical message, and finalizes the follow-up", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadSuccess,
      "Email Success Fixture",
      "lead-success@example.com",
    );

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: number; sent: number; deliveryMode: string };
    expect(body.deliveryMode).toBe("email");
    expect(body.claimed).toBe(1);
    expect(body.sent).toBe(1);

    // Exactly one external delivery attempt.
    expect(calls).toHaveLength(1);
    expect(calls[0].idempotencyKey).toBe(followupId);
    const requestBody = calls[0].body as {
      to: string[];
      from: string;
      subject: string;
      text: string;
    };
    expect(requestBody.to).toEqual(["lead-success@example.com"]);
    expect(requestBody.from).toContain(TEST_SENDER_ADDRESS);
    expect(requestBody.text).toContain(getFollowupTemplate(1));

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, message_id, delivery_provider, provider_message_id")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("sent");
    expect(followupAfter!.message_id).not.toBeNull();
    expect(followupAfter!.delivery_provider).toBe("resend");
    expect(followupAfter!.provider_message_id).toBeTruthy();

    // The canonical message content is the exact deterministic template —
    // never the email-specific subject/greeting/footer wrapper.
    const { data: canonicalMessage } = await admin
      .from("messages")
      .select("content, sender_type")
      .eq("id", followupAfter!.message_id!)
      .single();
    expect(canonicalMessage!.content).toBe(getFollowupTemplate(1));
    expect(canonicalMessage!.sender_type).toBe("ai");

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(3);
  }, 20_000);

  // ---- Scenario 2: no recipient email ----
  it("scenario 2: a lead with no email is skipped, not failed, and never calls the provider", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadNoEmail,
      "Email No-Recipient Fixture",
      null,
    );

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { claimed: number; sent: number; skipped: number };
    expect(body.claimed).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(calls).toHaveLength(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skipped_at, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("skipped");
    expect(followupAfter!.skipped_at).not.toBeNull();
    expect(followupAfter!.skip_reason).toBe("missing_email");
  }, 20_000);

  // ---- Scenario 3: invalid recipient email ----
  it("scenario 3: a syntactically invalid lead email is skipped deterministically, never calls the provider", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadInvalidEmail,
      "Email Invalid-Recipient Fixture",
      "not-an-email",
    );

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { skipped: number };
    expect(body.skipped).toBe(1);
    expect(calls).toHaveLength(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("skipped");
    expect(followupAfter!.skip_reason).toBe("invalid_email");
  }, 20_000);

  // ---- Scenario 4: closed conversation ----
  it("scenario 4: a closed conversation prevents any email, same as the canonical channel", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadClosedConversation,
      "Email Closed Conversation Fixture",
      "lead-closed@example.com",
    );
    await admin.from("conversations").update({ status: "closed" }).eq("id", conversationId);

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { cancelled: number };
    expect(body.cancelled).toBe(1);
    expect(calls).toHaveLength(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("cancelled");
    expect(followupAfter!.skip_reason).toBe("conversation_closed");
  }, 20_000);

  // ---- Scenario 5: lead reply before the worker runs ----
  it("scenario 5: a lead reply before the worker runs prevents any email", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadReply,
      "Email Lead Reply Fixture",
      "lead-reply@example.com",
    );
    await appendMessages(admin, {
      conversationId,
      companyId: QA_COMPANY_ID,
      messages: [{ senderType: "lead", content: "Doch noch eine Frage." }],
    });

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { cancelled: number };
    expect(body.cancelled).toBe(1);
    expect(calls).toHaveLength(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("cancelled");
    expect(followupAfter!.skip_reason).toBe("lead_replied");
  }, 20_000);

  // ---- Scenario 6: follow-ups stopped by the owner before the worker runs ----
  it("scenario 6: an owner-stopped follow-up (cancelled, no longer 'scheduled') is never even claimed, no email", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadStopped,
      "Email Stopped Fixture",
      "lead-stopped@example.com",
    );
    // Same effect as the dashboard's "Follow-ups stoppen" (cancelFollowupsForLead).
    await admin
      .from("conversation_followups")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        skip_reason: "owner_stopped",
      })
      .eq("id", followupId);

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { claimed: number };
    expect(body.claimed).toBe(0);
    expect(calls).toHaveLength(0);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("cancelled");
    expect(followupAfter!.skip_reason).toBe("owner_stopped");
  }, 20_000);

  // ---- Scenario 7: provider failure ----
  it("scenario 7: a provider rejection lands the follow-up in failed, never reports a false sent", async () => {
    const { fetchMock, calls } = createFakeResendFetch({ failAll: true });
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadProviderFailure,
      "Email Provider Failure Fixture",
      "lead-failure@example.com",
    );

    const res = await handleFollowupWorkerRequest(authorizedRequest());
    const body = (await res.json()) as { failed: number; sent: number };
    expect(body.failed).toBe(1);
    expect(body.sent).toBe(0);
    expect(calls).toHaveLength(1);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, failed_at, error_code")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("failed");
    expect(followupAfter!.failed_at).not.toBeNull();
    expect(followupAfter!.error_code).toContain("permanent");

    // No canonical message for a failed delivery.
    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(2);
  }, 20_000);

  // ---- Scenario 8: worker retry — no double email ----
  it("scenario 8a: a normal repeated worker call after a successful send makes no additional provider call", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    await seedDueFollowup(
      admin,
      FIXTURE.leadWorkerRetryDoubleClaim,
      "Email Worker Retry Fixture",
      "lead-retry@example.com",
    );

    await handleFollowupWorkerRequest(authorizedRequest());
    expect(calls).toHaveLength(1);

    // Nothing due anymore — a normal retry/re-run must not call the provider again.
    await handleFollowupWorkerRequest(authorizedRequest());
    expect(calls).toHaveLength(1);
  }, 20_000);

  it("scenario 8b: recovering a stale row whose email was already accepted by the provider never sends a second real email", async () => {
    const { fetchMock, deliveredKeys, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId, followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadWorkerRetryCrashRecovery,
      "Email Worker Crash Recovery Fixture",
      "lead-crash@example.com",
    );

    // Simulate the exact crash window email-delivery-adapter.ts is designed
    // for: the provider already accepted the send (and the canonical
    // message was already written) but the runtime died before the final
    // status UPDATE — the row is left stuck in 'processing'.
    await admin
      .from("conversation_followups")
      .update({ status: "processing" })
      .eq("id", followupId);
    const adapter = createEmailDeliveryAdapter({
      provider: createResendEmailProvider(TEST_API_KEY),
      senderConfig: { fromAddress: TEST_SENDER_ADDRESS, replyToAddress: TEST_SENDER_ADDRESS },
    });
    const deliveryResult = await adapter.deliver(admin, {
      followupId,
      conversationId,
      companyId: QA_COMPANY_ID,
      step: 1,
      content: getFollowupTemplate(1),
    });
    expect(deliveryResult.delivered).toBe(true);
    expect(calls).toHaveLength(1); // the "crashed" attempt's own real send

    await sleep(STALE_TEST_WAIT_MS);
    const recovery = await recoverStaleProcessingFollowups(admin, {
      staleAfterMinutes: STALE_TEST_THRESHOLD_MINUTES,
    });
    expect(recovery.reconciledAsSent).toBeGreaterThanOrEqual(1);

    // Recovery reconciles from the existing canonical message — it must
    // NEVER call the provider again.
    expect(calls).toHaveLength(1);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("sent");

    // Belt and braces: even if some future code path DID retry the send
    // with the same idempotency key, the fake provider's own dedup map
    // proves only one real delivery was ever recorded for this key.
    expect(deliveredKeys.size).toBe(1);
  }, 20_000);

  // ---- Scenario 9: concurrent workers — no double email ----
  it("scenario 9: two concurrent worker calls against the same due row cause exactly one real email", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { conversationId } = await seedDueFollowup(
      admin,
      FIXTURE.leadConcurrent,
      "Email Concurrent Fixture",
      "lead-concurrent@example.com",
    );

    const [res1, res2] = await Promise.all([
      handleFollowupWorkerRequest(authorizedRequest()),
      handleFollowupWorkerRequest(authorizedRequest()),
    ]);
    const [body1, body2] = (await Promise.all([res1.json(), res2.json()])) as { sent: number }[];
    expect(body1.sent + body2.sent).toBe(1);
    expect(calls).toHaveLength(1);

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(messageCount).toBe(3);
  }, 20_000);

  // ---- Scenario 10: delivery disabled ----
  it("scenario 10: EMAIL_DELIVERY_ENABLED=false keeps the scheduler working via the canonical channel, no external call", async () => {
    const { fetchMock, calls } = createFakeResendFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { followupId } = await seedDueFollowup(
      admin,
      FIXTURE.leadDeliveryDisabled,
      "Email Delivery Disabled Fixture",
      "lead-disabled@example.com",
    );

    process.env.EMAIL_DELIVERY_ENABLED = "false";
    try {
      const res = await handleFollowupWorkerRequest(authorizedRequest());
      const body = (await res.json()) as { deliveryMode: string; sent: number };
      expect(body.deliveryMode).toBe("canonical");
      expect(body.sent).toBe(1); // the scheduler itself still runs — only the channel changes
      expect(calls).toHaveLength(0);
    } finally {
      process.env.EMAIL_DELIVERY_ENABLED = "true";
    }

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("status, delivery_provider")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.status).toBe("sent");
    expect(followupAfter!.delivery_provider).toBe("canonical");
  }, 20_000);
});
