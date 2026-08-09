// Resend webhook receiver (Product Track slice 8A, see ROADMAP.md) —
// POST-only, exclusively accepts Resend/Svix-signed webhook deliveries,
// never a generic mail-API endpoint. Deliberately thin (task instructions,
// same discipline as followups.process.ts): signature verification →
// payload parsing → dedup → apply → observability, no business logic
// duplicated here.
//
// No CRON_SECRET-style bearer auth here — this endpoint must be reachable
// by Resend's own servers from the public internet, so the Svix signature
// itself IS the authentication (task Phase C3/C4): a request with a
// missing/invalid signature never reaches any DB write, full stop.
import { createFileRoute } from "@tanstack/react-router";
import { applyResendWebhookEvent, recordWebhookEvent } from "@/lib/email/email-webhook.functions";
import { parseResendWebhookPayload } from "@/lib/email/webhook-events";
import { verifyResendWebhook } from "@/lib/email/webhook-verification";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleResendWebhookRequest(request: Request): Promise<Response> {
  // Fail closed (task Phase C4): no configured secret means no webhook can
  // ever be accepted, not "accept everything unverified".
  const secret = process.env.EMAIL_PROVIDER_WEBHOOK_SECRET;
  if (!secret) {
    return jsonResponse({ error: "not_configured" }, 401);
  }

  // MUST be the raw, unparsed body — Resend's own docs are explicit that
  // parsing-then-restringifying breaks signature verification (task
  // Phase C2/C3).
  const rawBody = await request.text();
  const verifyResult = verifyResendWebhook({
    rawBody,
    headers: {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    },
    secret,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!verifyResult.ok) {
    // Observability (task Phase C18): "webhook rejected aufgrund
    // ungültiger Signatur" is one of the explicitly required events — no
    // payload/header values logged, only the rejection reason.
    await supabaseAdmin
      .from("system_events")
      .insert({
        kind: "error",
        source: "email.webhook",
        message: `rejected: ${verifyResult.reason}`,
        context: { reason: verifyResult.reason },
      })
      .then(
        () => {},
        () => {},
      );
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const parsedEvent = parseResendWebhookPayload(verifyResult.payload);
  if (!parsedEvent) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  // Already validated present by verifyResendWebhook (it requires all
  // three svix-* headers before attempting verification at all).
  const eventId = request.headers.get("svix-id")!;

  try {
    const { isDuplicate } = await recordWebhookEvent(supabaseAdmin, {
      eventId,
      eventType: parsedEvent.type,
    });
    if (isDuplicate) {
      // Ack normally — Resend's at-least-once delivery means a duplicate
      // is expected, routine traffic, not an error condition (task
      // Phase C5).
      return jsonResponse({ status: "duplicate_ignored" }, 200);
    }

    const result = await applyResendWebhookEvent(supabaseAdmin, parsedEvent, new Date());

    await supabaseAdmin.from("system_events").insert({
      kind: "success",
      source: "email.webhook",
      message: `event ${parsedEvent.type}: matched=${result.matched} status=${result.deliveryStatus ?? "none"} suppressed=${result.suppressed}`,
      context: {
        eventId,
        eventType: parsedEvent.type,
        matched: result.matched,
        deliveryStatus: result.deliveryStatus,
        suppressed: result.suppressed,
      },
    });

    return jsonResponse({ status: "ok" }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await supabaseAdmin.from("system_events").insert({
        kind: "error",
        source: "email.webhook",
        message: `processing failed: ${message.slice(0, 300)}`,
        context: { eventId, eventType: parsedEvent.type },
      });
    } catch {
      /* best-effort logging */
    }
    return jsonResponse({ error: "internal_error" }, 500);
  }
}

export const Route = createFileRoute("/api/internal/email/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleResendWebhookRequest(request),
    },
  },
});
