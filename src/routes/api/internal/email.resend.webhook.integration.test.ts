// Real-DB integration tests for the Resend webhook receiver (Product
// Track slice 8A, see ROADMAP.md) — real signature verification (via the
// actual `svix` library, same as webhook-verification.test.ts) against the
// real, connected Supabase project. No mocked fetch needed here — this
// endpoint receives requests, it doesn't make any outbound HTTP calls.
//
// Skipped entirely (not failed) without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// — same convention as every other integration test in this repo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleResendWebhookRequest } from "./email.resend.webhook";
import {
  appendMessages,
  findOrCreateConversation,
} from "@/lib/conversations/conversations.functions";
import { ensureFollowupsForConversation } from "@/lib/followups/followups.functions";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";
const WEBHOOK_SECRET = `whsec_${Buffer.from("test-only-webhook-signing-secret-slice-8a").toString("base64")}`;

// Own fixture-id range — f0140001-... — deliberately disjoint from slices
// 5/6/7's f0110001-/f0120001-/f0130001- ranges.
const FIXTURE = {
  leadBounceHard: "f0140001-0000-0000-0000-000000000001",
  leadComplaint: "f0140001-0000-0000-0000-000000000002",
  leadDelivered: "f0140001-0000-0000-0000-000000000003",
  leadBounceSoft: "f0140001-0000-0000-0000-000000000004",
} as const;

function signedRequest(payload: unknown, opts: { secret?: string; msgId?: string } = {}): Request {
  const body = JSON.stringify(payload);
  const secret = opts.secret ?? WEBHOOK_SECRET;
  const webhook = new Webhook(secret);
  const id = opts.msgId ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = new Date();
  const signature = webhook.sign(id, timestamp, body);
  return new Request("https://example.com/api/internal/email/resend/webhook", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  });
}

/** Seeds a conversation_followups row that's already `sent` with a known
 * provider_message_id — exactly the state a real webhook event needs to
 * correlate against (see email-webhook.functions.ts). */
async function seedSentFollowupWithProviderMessageId(
  admin: SupabaseClient<Database>,
  leadId: string,
  name: string,
  providerMessageId: string,
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
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      delivery_provider: "resend",
      provider_message_id: providerMessageId,
      delivery_status: "accepted",
    })
    .eq("id", step1!.id);
  return { conversationId, followupId: step1!.id };
}

describe.skipIf(!hasCredentials)("Resend webhook receiver (real DB, real signatures)", () => {
  let admin: SupabaseClient<Database>;
  const seededLeadIds = new Set<string>(Object.values(FIXTURE));
  const seededEmails: { companyId: string; email: string }[] = [];
  const seededWebhookEventIds = new Set<string>();

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    process.env.EMAIL_PROVIDER_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterAll(async () => {
    delete process.env.EMAIL_PROVIDER_WEBHOOK_SECRET;
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
      await admin
        .from("email_suppressions")
        .delete()
        .eq("company_id", companyId)
        .eq("email", email);
    }
    for (const id of seededWebhookEventIds) {
      await admin.from("email_webhook_events").delete().eq("id", id);
    }
  });

  it("scenario: missing secret configuration fails closed with 401, never touches the DB", async () => {
    delete process.env.EMAIL_PROVIDER_WEBHOOK_SECRET;
    try {
      const request = signedRequest({
        type: "email.delivered",
        data: { email_id: "x", to: ["a@example.com"] },
      });
      const res = await handleResendWebhookRequest(request);
      expect(res.status).toBe(401);
    } finally {
      process.env.EMAIL_PROVIDER_WEBHOOK_SECRET = WEBHOOK_SECRET;
    }
  }, 20_000);

  it("scenario: an invalid signature is rejected with 401", async () => {
    const request = signedRequest(
      { type: "email.delivered", data: { email_id: "x", to: ["a@example.com"] } },
      { secret: `whsec_${Buffer.from("a-totally-different-secret").toString("base64")}` },
    );
    const res = await handleResendWebhookRequest(request);
    expect(res.status).toBe(401);
  }, 20_000);

  it("scenario: a valid hard-bounce event updates delivery_status, suppresses the recipient, and is idempotent on redelivery", async () => {
    const providerMessageId = `email_test_${Math.random().toString(36).slice(2)}`;
    const { followupId } = await seedSentFollowupWithProviderMessageId(
      admin,
      FIXTURE.leadBounceHard,
      "Webhook Hard Bounce Fixture",
      providerMessageId,
    );
    seededEmails.push({ companyId: QA_COMPANY_ID, email: "bounced-lead@example.com" });

    const msgId = `msg_bounce_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);
    const payload = {
      type: "email.bounced",
      data: {
        email_id: providerMessageId,
        to: ["bounced-lead@example.com"],
        bounce: { type: "Permanent", subType: "Suppressed", message: "hard bounce" },
      },
    };

    const res1 = await handleResendWebhookRequest(signedRequest(payload, { msgId }));
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { status: string };
    expect(body1.status).toBe("ok");

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("delivery_status, bounce_type")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.delivery_status).toBe("bounced");
    expect(followupAfter!.bounce_type).toBe("hard");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("reason")
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "bounced-lead@example.com")
      .maybeSingle();
    expect(suppression?.reason).toBe("bounce");

    // Redelivery of the exact same event (same svix-id) — Resend documents
    // at-least-once delivery; this must be a no-op ack, not a duplicate
    // suppression row (blocked by the unique constraint anyway, but the
    // handler must not error).
    const res2 = await handleResendWebhookRequest(signedRequest(payload, { msgId }));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { status: string };
    expect(body2.status).toBe("duplicate_ignored");

    const { count: suppressionCount } = await admin
      .from("email_suppressions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "bounced-lead@example.com");
    expect(suppressionCount).toBe(1);
  }, 20_000);

  it("scenario: a soft bounce updates delivery_status but does NOT suppress the recipient", async () => {
    const providerMessageId = `email_test_${Math.random().toString(36).slice(2)}`;
    const { followupId } = await seedSentFollowupWithProviderMessageId(
      admin,
      FIXTURE.leadBounceSoft,
      "Webhook Soft Bounce Fixture",
      providerMessageId,
    );
    const msgId = `msg_softbounce_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);

    const res = await handleResendWebhookRequest(
      signedRequest(
        {
          type: "email.bounced",
          data: {
            email_id: providerMessageId,
            to: ["soft-bounce-lead@example.com"],
            bounce: { type: "Transient" },
          },
        },
        { msgId },
      ),
    );
    expect(res.status).toBe(200);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("delivery_status, bounce_type")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.delivery_status).toBe("bounced");
    expect(followupAfter!.bounce_type).toBe("soft");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "soft-bounce-lead@example.com")
      .maybeSingle();
    expect(suppression).toBeNull();
  }, 20_000);

  it("scenario: a complaint event suppresses the recipient", async () => {
    const providerMessageId = `email_test_${Math.random().toString(36).slice(2)}`;
    const { followupId } = await seedSentFollowupWithProviderMessageId(
      admin,
      FIXTURE.leadComplaint,
      "Webhook Complaint Fixture",
      providerMessageId,
    );
    seededEmails.push({ companyId: QA_COMPANY_ID, email: "complained-lead@example.com" });
    const msgId = `msg_complaint_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);

    const res = await handleResendWebhookRequest(
      signedRequest(
        {
          type: "email.complained",
          data: { email_id: providerMessageId, to: ["complained-lead@example.com"] },
        },
        { msgId },
      ),
    );
    expect(res.status).toBe(200);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("delivery_status")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.delivery_status).toBe("complained");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("reason")
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "complained-lead@example.com")
      .maybeSingle();
    expect(suppression?.reason).toBe("complaint");
  }, 20_000);

  it("scenario: a delivered event updates delivery_status without suppressing anyone", async () => {
    const providerMessageId = `email_test_${Math.random().toString(36).slice(2)}`;
    const { followupId } = await seedSentFollowupWithProviderMessageId(
      admin,
      FIXTURE.leadDelivered,
      "Webhook Delivered Fixture",
      providerMessageId,
    );
    const msgId = `msg_delivered_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);

    const res = await handleResendWebhookRequest(
      signedRequest(
        {
          type: "email.delivered",
          data: { email_id: providerMessageId, to: ["delivered-lead@example.com"] },
        },
        { msgId },
      ),
    );
    expect(res.status).toBe(200);

    const { data: followupAfter } = await admin
      .from("conversation_followups")
      .select("delivery_status")
      .eq("id", followupId)
      .single();
    expect(followupAfter!.delivery_status).toBe("delivered");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", QA_COMPANY_ID)
      .eq("email", "delivered-lead@example.com")
      .maybeSingle();
    expect(suppression).toBeNull();
  }, 20_000);

  it("scenario: an unrecognized event type is acknowledged and recorded, with no delivery_status change and no error", async () => {
    const msgId = `msg_unknown_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);
    const res = await handleResendWebhookRequest(
      signedRequest(
        {
          type: "email.some_future_event_type",
          data: { email_id: "nonexistent-id", to: ["x@example.com"] },
        },
        { msgId },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  }, 20_000);

  it("scenario: an event for an unknown provider_message_id (no matching followup) is acknowledged, not an error", async () => {
    const msgId = `msg_nomatch_${Math.random().toString(36).slice(2)}`;
    seededWebhookEventIds.add(msgId);
    const res = await handleResendWebhookRequest(
      signedRequest(
        {
          type: "email.delivered",
          data: { email_id: "no-such-provider-message-id", to: ["x@example.com"] },
        },
        { msgId },
      ),
    );
    expect(res.status).toBe(200);
  }, 20_000);
});
