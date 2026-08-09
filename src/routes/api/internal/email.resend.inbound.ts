// Resend inbound-email webhook receiver (Product Track slice 8B, see
// ROADMAP.md) — the inbound counterpart to email.resend.webhook.ts.
// Deliberately thin, same discipline as every other route in this repo:
// signature verification → dedup → orchestration (inbound-webhook.
// functions.ts) → observability, no business logic duplicated here.
//
// Reuses slice 8A's shared secure infrastructure rather than duplicating
// it (task Phase 6): verifyResendWebhook (Svix signature check) and
// recordWebhookEvent/email_webhook_events (dedup ledger) are the exact
// same functions/table the outbound status webhook uses — genuinely
// generic, no inbound-specific shape baked into either.
//
// A SEPARATE signing secret from the outbound webhook
// (EMAIL_INBOUND_WEBHOOK_SECRET, not EMAIL_PROVIDER_WEBHOOK_SECRET): this
// is its own Resend "Webhook" resource pointed at this URL, with its own
// Svix secret — matching the "separate secret per purpose" discipline
// already used for EMAIL_UNSUBSCRIBE_SECRET vs EMAIL_INBOUND_TOKEN_SECRET.
//
// No CRON_SECRET-style bearer auth (same reasoning as the outbound
// webhook): this must be reachable from Resend's public servers, so the
// Svix signature itself is the authentication — fail closed on anything
// else.
import { createFileRoute } from "@tanstack/react-router";
import { processInboundEmail } from "@/lib/email/inbound-webhook.functions";
import { parseInboundWebhookPayload } from "@/lib/email/inbound-webhook-events";
import { recordWebhookEvent } from "@/lib/email/email-webhook.functions";
import { verifyResendWebhook } from "@/lib/email/webhook-verification";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleResendInboundRequest(request: Request): Promise<Response> {
  // Fail closed (task Phase 21): inbound is entirely opt-in server-side
  // config. Any one of these missing means inbound cannot possibly be
  // processed correctly (no domain to validate the recipient against, no
  // secret to verify tokens, no signing secret to trust the request, no
  // API key to fetch the real email body) — never a partial/best-effort
  // attempt.
  const webhookSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
  const inboundDomain = process.env.EMAIL_INBOUND_DOMAIN;
  const tokenSecret = process.env.EMAIL_INBOUND_TOKEN_SECRET;
  const resendApiKey = process.env.EMAIL_PROVIDER_API_KEY;
  if (!webhookSecret || !inboundDomain || !tokenSecret || !resendApiKey) {
    return jsonResponse({ error: "not_configured" }, 401);
  }

  // MUST be the raw, unparsed body — see email.resend.webhook.ts's same
  // comment; re-serializing breaks Svix signature verification.
  const rawBody = await request.text();
  const verifyResult = verifyResendWebhook({
    rawBody,
    headers: {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    },
    secret: webhookSecret,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!verifyResult.ok) {
    await supabaseAdmin
      .from("system_events")
      .insert({
        kind: "error",
        source: "email.inbound",
        message: `rejected: ${verifyResult.reason}`,
        context: { reason: verifyResult.reason },
      })
      .then(
        () => {},
        () => {},
      );
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const parsedEvent = parseInboundWebhookPayload(verifyResult.payload);
  if (!parsedEvent) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  // Already validated present by verifyResendWebhook.
  const eventId = request.headers.get("svix-id")!;

  try {
    // Dedup FIRST, before any other processing (task Phase 7) — the same
    // ledger/table slice 8A's outbound webhook uses, same ordering
    // guarantee: a redelivered event (Svix reuses the same svix-id across
    // retry attempts of one logical delivery) can never reach the
    // canonical-message write below twice. The accepted tradeoff (matches
    // slice 8A's own, unchanged here): a transient failure AFTER this
    // point (e.g. the Receiving API fetch below) is not auto-recovered by
    // a Svix retry, since the retry would just dedupe out — logged clearly
    // instead, see the catch/fetch_failed_transient handling below.
    const { isDuplicate } = await recordWebhookEvent(supabaseAdmin, {
      eventId,
      eventType: parsedEvent.type,
    });
    if (isDuplicate) {
      await supabaseAdmin
        .from("system_events")
        .insert({
          kind: "success",
          source: "email.inbound",
          message: "duplicate webhook delivery ignored",
          context: { eventType: parsedEvent.type },
        })
        .then(
          () => {},
          () => {},
        );
      return jsonResponse({ status: "duplicate_ignored" }, 200);
    }

    const result = await processInboundEmail(supabaseAdmin, {
      event: parsedEvent,
      inboundDomain,
      tokenSecret,
      resendApiKey,
    });

    // Observability (task Phase 18) — one structured event per request,
    // outcome-only. Never the mail text, never a full email address beyond
    // what's already needed to explain the outcome, never the reply token,
    // never the webhook secret/signature.
    const isTransientFailure = result.outcome === "fetch_failed_transient";
    await supabaseAdmin.from("system_events").insert({
      kind: isTransientFailure ? "error" : "success",
      source: "email.inbound",
      message: `event outcome=${result.outcome}`,
      context: { eventId, eventType: parsedEvent.type, outcome: result.outcome },
    });

    // Every reachable outcome is acknowledged with 200 — including
    // fetch_failed_transient (see the dedup comment above: a 5xx here
    // would not actually earn a useful retry once the event is already
    // recorded, so returning 200 with a clear error-kind system_event is
    // the honest response rather than implying a retry will help).
    return jsonResponse({ status: "ok", outcome: result.outcome }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await supabaseAdmin.from("system_events").insert({
        kind: "error",
        source: "email.inbound",
        message: `processing failed: ${message.slice(0, 300)}`,
        context: { eventId, eventType: parsedEvent.type },
      });
    } catch {
      /* best-effort logging */
    }
    return jsonResponse({ error: "internal_error" }, 500);
  }
}

export const Route = createFileRoute("/api/internal/email/resend/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => handleResendInboundRequest(request),
    },
  },
});
