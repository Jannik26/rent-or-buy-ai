// Real-DB integration tests for the Resend inbound-email webhook receiver
// (Product Track slice 8B, see ROADMAP.md) — real signature verification
// (via the actual `svix` library) against the real, connected Supabase
// project. Same "mock only the external Resend HTTP call, pass everything
// else through to the real fetch" discipline as
// followups.process.email.integration.test.ts — see that file's header
// comment for why vi.stubGlobal("fetch", ...) must forward non-Resend URLs
// to the real fetch or the whole Supabase layer breaks underneath the test.
//
// Skipped entirely (not failed) without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// — same convention as every other integration test in this repo. Run with:
//   node --env-file-if-exists=.env node_modules/.bin/vitest run src/routes/api/internal/email.resend.inbound.integration.test.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleResendInboundRequest } from "./email.resend.inbound";
import {
  appendMessages,
  findOrCreateConversation,
} from "@/lib/conversations/conversations.functions";
import { ensureFollowupsForConversation } from "@/lib/followups/followups.functions";
import { addSuppression } from "@/lib/email/suppression";
import { buildReplyAddress, signReplyToken } from "@/lib/email/reply-token";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";
const WEBHOOK_SECRET = `whsec_${Buffer.from("test-only-inbound-webhook-signing-secret-8b").toString("base64")}`;
const INBOUND_DOMAIN = "reply.estateai.de.test";
const TOKEN_SECRET = "test-only-inbound-token-secret-slice-8b";
const RESEND_API_KEY = "re_test_only_key_never_real";

// Own fixture-id range — f0150001-... — deliberately disjoint from slices
// 6/7/8A's f0110001-/f0120001-/f0130001-/f0140001- ranges.
const FIXTURE = {
  leadHappyPath: "f0150001-0000-0000-0000-000000000001",
  leadInvalidToken: "f0150001-0000-0000-0000-000000000002",
  leadCrossTenant: "f0150001-0000-0000-0000-000000000003",
  leadCrossTenantOther: "f0150001-0000-0000-0000-000000000011",
  leadSenderMismatch: "f0150001-0000-0000-0000-000000000004",
  leadEmptyContent: "f0150001-0000-0000-0000-000000000005",
  leadHtml: "f0150001-0000-0000-0000-000000000006",
  leadPendingRetry: "f0150001-0000-0000-0000-000000000007",
  leadUnsubscribed: "f0150001-0000-0000-0000-000000000008",
  leadClosedConversation: "f0150001-0000-0000-0000-000000000009",
  leadConcurrentDuplicate: "f0150001-0000-0000-0000-000000000010",
} as const;

function signedInboundRequest(payload: unknown, opts: { secret?: string; msgId?: string } = {}): Request {
  const body = JSON.stringify(payload);
  const secret = opts.secret ?? WEBHOOK_SECRET;
  const webhook = new Webhook(secret);
  const id = opts.msgId ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = new Date();
  const signature = webhook.sign(id, timestamp, body);
  return new Request("https://example.com/api/internal/email/resend/inbound", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  });
}

async function seedLeadAndConversation(
  admin: SupabaseClient<Database>,
  leadId: string,
  name: string,
  email: string,
): Promise<{ conversationId: string }> {
  await admin.from("leads").upsert({ id: leadId, company_id: QA_COMPANY_ID, name, email, status: "neu" });
  const conversationId = await findOrCreateConversation(admin, { leadId, companyId: QA_COMPANY_ID });
  return { conversationId };
}

function replyAddressFor(conversationId: string): string {
  return buildReplyAddress(signReplyToken({ conversationId }, TOKEN_SECRET), INBOUND_DOMAIN);
}

const realFetch = globalThis.fetch;
const RECEIVING_API_URL = "https://api.resend.com/emails/receiving";

type FakeReceivedEmail = {
  from: string;
  to: string[];
  text: string | null;
  html: string | null;
  attachments?: unknown[];
};

/** Mocks only Resend's Receiving API (GET /emails/receiving/{id}); every
 * other URL (Supabase) is forwarded to the real fetch — see the file header
 * comment for why that's required. */
function createFakeReceivingFetch(emails: Map<string, FakeReceivedEmail>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (!urlString.startsWith(RECEIVING_API_URL)) {
      return realFetch(url as never, init);
    }
    const id = decodeURIComponent(urlString.slice(RECEIVING_API_URL.length + 1));
    calls.push(id);
    const email = emails.get(id);
    if (!email) {
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        object: "email",
        id,
        from: email.from,
        to: email.to,
        created_at: new Date().toISOString(),
        subject: "Re: Ihre Anfrage",
        text: email.text,
        html: email.html,
        message_id: `<${id}@test>`,
        attachments: email.attachments ?? [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return { fetchMock, calls };
}

describe.skipIf(!hasCredentials)("Resend inbound-email webhook (real DB, real signatures)", () => {
  let admin: SupabaseClient<Database>;
  const seededLeadIds = new Set<string>(Object.values(FIXTURE));
  const seededEmails: { companyId: string; email: string }[] = [];

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    process.env.EMAIL_INBOUND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.EMAIL_INBOUND_DOMAIN = INBOUND_DOMAIN;
    process.env.EMAIL_INBOUND_TOKEN_SECRET = TOKEN_SECRET;
    process.env.EMAIL_PROVIDER_API_KEY = RESEND_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    delete process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
    delete process.env.EMAIL_INBOUND_DOMAIN;
    delete process.env.EMAIL_INBOUND_TOKEN_SECRET;
    delete process.env.EMAIL_PROVIDER_API_KEY;
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
    for (const { companyId, email } of seededEmails) {
      await admin.from("email_suppressions").delete().eq("company_id", companyId).eq("email", email);
    }
  });

  it("scenario: happy path — exactly one canonical lead message, and open follow-ups are cancelled", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadHappyPath,
      "Inbound Happy Path Fixture",
      "happy-path-lead@example.com",
    );
    await appendMessages(admin, {
      conversationId,
      companyId: QA_COMPANY_ID,
      messages: [
        { senderType: "lead", content: "Erstkontakt." },
        { senderType: "ai", content: "Antwort darauf." },
      ],
    });
    await ensureFollowupsForConversation(admin, { conversationId, companyId: QA_COMPANY_ID, originAt: new Date() });
    const { data: step1Before } = await admin
      .from("conversation_followups")
      .select("id, status")
      .eq("conversation_id", conversationId)
      .eq("step", 1)
      .single();
    expect(step1Before!.status).toBe("scheduled");

    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      [
        "rcv_happy",
        {
          from: "happy-path-lead@example.com",
          to: [replyAddress],
          text: "Ja, das klingt gut, bitte rufen Sie mich an.",
          html: null,
        },
      ],
    ]);
    const { fetchMock, calls } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_happy", from: "happy-path-lead@example.com", to: [replyAddress], attachments: [] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: string };
    expect(body.outcome).toBe("message_created");
    expect(calls).toEqual(["rcv_happy"]);

    const { data: messages } = await admin
      .from("messages")
      .select("sender_type, content, sequence")
      .eq("conversation_id", conversationId)
      .order("sequence", { ascending: true });
    expect(messages).toHaveLength(3);
    const leadReply = messages![2];
    expect(leadReply.sender_type).toBe("lead");
    expect(leadReply.content).toBe("Ja, das klingt gut, bitte rufen Sie mich an.");
    expect(leadReply.sequence).toBe(2); // server-side, strictly after the seeded 0/1

    const { data: step1After } = await admin
      .from("conversation_followups")
      .select("status, skip_reason")
      .eq("id", step1Before!.id)
      .single();
    expect(step1After!.status).toBe("cancelled");
    expect(step1After!.skip_reason).toBe("lead_replied");
  }, 20_000);

  it("scenario: duplicate delivery of the same event never creates a second message", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadHappyPath,
      "Inbound Happy Path Fixture",
      "happy-path-lead@example.com",
    );
    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      ["rcv_dup", { from: "happy-path-lead@example.com", to: [replyAddress], text: "Zweite Antwort.", html: null }],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const msgId = `msg_dup_${Math.random().toString(36).slice(2)}`;
    const payload = {
      type: "email.received",
      data: { email_id: "rcv_dup", from: "happy-path-lead@example.com", to: [replyAddress], attachments: [] },
    };

    const res1 = await handleResendInboundRequest(signedInboundRequest(payload, { msgId }));
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { status: string };
    expect(body1.status).toBe("ok");

    const res2 = await handleResendInboundRequest(signedInboundRequest(payload, { msgId }));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { status: string };
    expect(body2.status).toBe("duplicate_ignored");

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("content", "Zweite Antwort.");
    expect(count).toBe(1);
  }, 20_000);

  it("scenario: an invalid signature is rejected with 401, no message created", async () => {
    const res = await handleResendInboundRequest(
      signedInboundRequest(
        { type: "email.received", data: { email_id: "x", from: "a@example.com", to: ["reply+x@" + INBOUND_DOMAIN] } },
        { secret: `whsec_${Buffer.from("a-totally-different-secret").toString("base64")}` },
      ),
    );
    expect(res.status).toBe(401);
  }, 20_000);

  it("scenario: an invalid/garbage reply token is rejected, no message, no tenant leak", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadInvalidToken,
      "Inbound Invalid Token Fixture",
      "invalid-token-lead@example.com",
    );
    const bogusAddress = `reply+not-a-real-token@${INBOUND_DOMAIN}`;
    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_invalid_token", from: "invalid-token-lead@example.com", to: [bogusAddress] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe("invalid_token");

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(count).toBe(0);
  }, 20_000);

  it("scenario: cross-tenant — a tampered token (real signature, different conversationId payload) is rejected", async () => {
    const { conversationId: ownConversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadCrossTenant,
      "Inbound Cross-Tenant Fixture A",
      "cross-tenant-a@example.com",
    );
    const { conversationId: otherConversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadCrossTenantOther,
      "Inbound Cross-Tenant Fixture B",
      "cross-tenant-b@example.com",
    );

    // A validly-signed token for `ownConversationId`, with its payload
    // swapped for `otherConversationId` post-signing — the HMAC signature
    // no longer matches, demonstrating the token cannot be repointed at a
    // different conversation without invalidating the signature.
    const realToken = signReplyToken({ conversationId: ownConversationId }, TOKEN_SECRET);
    const [, signature] = realToken.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ conversationId: otherConversationId }), "utf8").toString(
      "base64url",
    );
    const forgedToken = `${forgedPayload}.${signature}`;
    const forgedAddress = buildReplyAddress(forgedToken, INBOUND_DOMAIN);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_cross_tenant", from: "cross-tenant-a@example.com", to: [forgedAddress] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe("invalid_token");

    const { count: ownCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", ownConversationId);
    const { count: otherCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", otherConversationId);
    expect(ownCount).toBe(0);
    expect(otherCount).toBe(0);
  }, 20_000);

  it("scenario: sender mismatch — a valid token but a From that doesn't match the lead's email creates no message", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadSenderMismatch,
      "Inbound Sender Mismatch Fixture",
      "cross-tenant-b@example.com",
    );
    const replyAddress = replyAddressFor(conversationId);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_sender_mismatch", from: "attacker@evil.com", to: [replyAddress] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe("sender_mismatch");

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(count).toBe(0);
  }, 20_000);

  it("scenario: empty content after normalization creates no empty canonical message", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadEmptyContent,
      "Inbound Empty Content Fixture",
      "empty-content-lead@example.com",
    );
    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      ["rcv_empty", { from: "empty-content-lead@example.com", to: [replyAddress], text: "   \n  ", html: null }],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_empty", from: "empty-content-lead@example.com", to: [replyAddress] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe("empty_content");

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(count).toBe(0);
  }, 20_000);

  it("scenario: HTML body is safely reduced to plain text — no script/tags stored", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadHtml,
      "Inbound HTML Fixture",
      "html-lead@example.com",
    );
    const replyAddress = replyAddressFor(conversationId);
    const maliciousHtml =
      '<p>Klingt super, bitte rufen Sie mich an!</p><script>alert("xss")</script><img src=x onerror=alert(1)>';
    const emails = new Map<string, FakeReceivedEmail>([
      ["rcv_html", { from: "html-lead@example.com", to: [replyAddress], text: null, html: maliciousHtml }],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_html", from: "html-lead@example.com", to: [replyAddress] },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe("message_created");

    const { data: message } = await admin
      .from("messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "lead")
      .single();
    expect(message!.content).toContain("Klingt super, bitte rufen Sie mich an!");
    expect(message!.content).not.toMatch(/[<>]/);
    expect(message!.content.toLowerCase()).not.toContain("script");
    expect(message!.content.toLowerCase()).not.toContain("onerror");
  }, 20_000);

  it("scenario: a lead reply cancels a pending/retry-scheduled follow-up so it is never sent later", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadPendingRetry,
      "Inbound Pending Retry Fixture",
      "pending-retry-lead@example.com",
    );
    await appendMessages(admin, {
      conversationId,
      companyId: QA_COMPANY_ID,
      messages: [
        { senderType: "lead", content: "Erstkontakt." },
        { senderType: "ai", content: "Antwort darauf." },
      ],
    });
    await ensureFollowupsForConversation(admin, { conversationId, companyId: QA_COMPANY_ID, originAt: new Date() });
    const { data: step1 } = await admin
      .from("conversation_followups")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("step", 1)
      .single();
    // Simulate a followup that previously hit a transient send failure and
    // is now awaiting a backoff retry (task Phase C13-C17, slice 8A).
    await admin
      .from("conversation_followups")
      .update({ attempt_count: 1, next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq("id", step1!.id);

    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      [
        "rcv_pending_retry",
        { from: "pending-retry-lead@example.com", to: [replyAddress], text: "Bitte keine weiteren E-Mails mehr nötig.", html: null },
      ],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_pending_retry", from: "pending-retry-lead@example.com", to: [replyAddress] },
      }),
    );
    expect((await res.json()).outcome).toBe("message_created");

    const { data: step1After } = await admin
      .from("conversation_followups")
      .select("status")
      .eq("id", step1!.id)
      .single();
    expect(step1After!.status).toBe("cancelled");
  }, 20_000);

  it("scenario: an unsubscribed lead's reply is still accepted; suppression stays, no new follow-ups get scheduled", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadUnsubscribed,
      "Inbound Unsubscribed Fixture",
      "unsubscribed-lead@example.com",
    );
    seededEmails.push({ companyId: QA_COMPANY_ID, email: "unsubscribed-lead@example.com" });
    await addSuppression(admin, {
      companyId: QA_COMPANY_ID,
      email: "unsubscribed-lead@example.com",
      reason: "unsubscribe",
    });

    const { count: followupCountBefore } = await admin
      .from("conversation_followups")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      [
        "rcv_unsubscribed",
        { from: "unsubscribed-lead@example.com", to: [replyAddress], text: "Doch noch eine Frage.", html: null },
      ],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_unsubscribed", from: "unsubscribed-lead@example.com", to: [replyAddress] },
      }),
    );
    expect((await res.json()).outcome).toBe("message_created");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("reason")
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "unsubscribed-lead@example.com")
      .maybeSingle();
    expect(suppression?.reason).toBe("unsubscribe");

    const { count: followupCountAfter } = await admin
      .from("conversation_followups")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(followupCountAfter).toBe(followupCountBefore ?? 0);
  }, 20_000);

  it("scenario: a reply to a closed conversation reopens it", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadClosedConversation,
      "Inbound Closed Conversation Fixture",
      "closed-conversation-lead@example.com",
    );
    await admin.from("conversations").update({ status: "closed" }).eq("id", conversationId);

    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      [
        "rcv_closed",
        { from: "closed-conversation-lead@example.com", to: [replyAddress], text: "Ich habe doch noch Interesse.", html: null },
      ],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleResendInboundRequest(
      signedInboundRequest({
        type: "email.received",
        data: { email_id: "rcv_closed", from: "closed-conversation-lead@example.com", to: [replyAddress] },
      }),
    );
    expect((await res.json()).outcome).toBe("message_created");

    const { data: conversation } = await admin
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();
    expect(conversation!.status).toBe("open");
  }, 20_000);

  it("scenario: two concurrent deliveries of the same event create exactly one canonical message", async () => {
    const { conversationId } = await seedLeadAndConversation(
      admin,
      FIXTURE.leadConcurrentDuplicate,
      "Inbound Concurrent Duplicate Fixture",
      "concurrent-lead@example.com",
    );
    const replyAddress = replyAddressFor(conversationId);
    const emails = new Map<string, FakeReceivedEmail>([
      ["rcv_concurrent", { from: "concurrent-lead@example.com", to: [replyAddress], text: "Gleichzeitige Zustellung.", html: null }],
    ]);
    const { fetchMock } = createFakeReceivingFetch(emails);
    vi.stubGlobal("fetch", fetchMock);

    const msgId = `msg_concurrent_${Math.random().toString(36).slice(2)}`;
    const payload = {
      type: "email.received",
      data: { email_id: "rcv_concurrent", from: "concurrent-lead@example.com", to: [replyAddress] },
    };

    const [res1, res2] = await Promise.all([
      handleResendInboundRequest(signedInboundRequest(payload, { msgId })),
      handleResendInboundRequest(signedInboundRequest(payload, { msgId })),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const outcomes = [(await res1.json()).status, (await res2.json()).status].sort();
    // Exactly one of the two requests actually processed the event; the
    // other must observe the dedup row the first one inserted.
    expect(outcomes).toEqual(["duplicate_ignored", "ok"]);

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("content", "Gleichzeitige Zustellung.");
    expect(count).toBe(1);
  }, 20_000);
});
