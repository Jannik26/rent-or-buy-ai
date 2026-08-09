// Production worker entry point for the Automated Lead Follow-ups engine
// (Product Track slice 6, see ROADMAP.md) — the piece that gives Slice 5's
// processDueFollowups any actual operational effect. Triggered by Vercel
// Cron (see vercel.json), which always issues a GET request; POST is also
// accepted for manual/local testing (curl -X POST with the same header).
//
// Deliberately thin: this file authenticates the caller, applies the kill
// switch, and orchestrates the two existing worker functions
// (recoverStaleProcessingFollowups, processDueFollowups) — it must never
// duplicate follow-up domain logic (task instructions). All scheduling/
// abort/delivery rules stay exactly where Slice 5 put them
// (src/lib/followups/).
//
// No CORS headers, no OPTIONS handler: unlike widget.chat.ts (meant to be
// called cross-origin from an embedded visitor's browser), this endpoint is
// only ever called server-to-server (Vercel Cron, or a manual authenticated
// curl) — same-origin-only is the correct, more restrictive default here,
// not an oversight.
import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE,
  DEFAULT_STALE_PROCESSING_MINUTES,
  parsePositiveIntEnv,
} from "@/lib/followups/followup-rules";
import {
  canonicalMessageDeliveryAdapter,
  processDueFollowups,
  recoverStaleProcessingFollowups,
  type FollowupDeliveryAdapter,
} from "@/lib/followups/followups.functions";
import { createEmailDeliveryAdapter } from "@/lib/followups/email-delivery-adapter";
import { createResendEmailProvider } from "@/lib/email/providers/resend-provider";
import { isEmailDeliveryEnabled, resolveEmailProviderConfig } from "@/lib/email/email-rules";

/** Constant-time secret comparison — hashing both sides to a fixed 32-byte
 * digest first means `timingSafeEqual` never short-circuits on a length
 * mismatch (which would itself leak timing information about the secret's
 * length), on top of comparing the actual bytes without early-exit. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/** `CRON_SECRET` — Vercel's own documented convention for securing Cron
 * Jobs (https://vercel.com/docs/cron-jobs/manage-cron-jobs): when a
 * `CRON_SECRET` env var is set on the project, Vercel automatically sends
 * `Authorization: Bearer <value>` on every cron-triggered request. Using
 * this exact name (rather than inventing e.g. FOLLOWUP_CRON_SECRET) means
 * Vercel wires the header up for free once the env var is set — no extra
 * "add a custom header" configuration needed on Vercel's side. The check
 * below never trusts that wiring blindly, though: it verifies the header
 * itself, every request, regardless of how it arrived.
 *
 * Takes `expectedSecret` as a plain argument (not a `process.env` read
 * inside the function) so this stays unit-testable without mocking
 * `process.env` — the route handler is the only caller that actually reads
 * the env var, see below. */
export function isAuthorized(request: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false; // fail closed if not configured
  const authHeader = request.headers.get("authorization") ?? "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!providedSecret) return false;
  return timingSafeEqualStrings(providedSecret, expectedSecret);
}

/** Decides which FollowupDeliveryAdapter this run should use — the one
 * place slice 7's email delivery is wired into slice 5/6's worker. Pure:
 * takes already-read env-var strings as plain arguments (never reads
 * process.env itself), so the decision logic itself is unit-testable
 * without touching real env vars or constructing a real provider.
 *
 * Safe by construction (task Phase 3/15): real email delivery is used only
 * when BOTH `EMAIL_DELIVERY_ENABLED` is explicitly truthy AND a complete,
 * syntactically valid provider config is present. Any other combination —
 * disabled, or enabled but not (yet) configured — silently falls back to
 * the existing canonicalMessageDeliveryAdapter, i.e. the exact slice 5/6
 * demo-safe behavior. There is no error state for "misconfigured": an
 * operator who sets EMAIL_DELIVERY_ENABLED=true without also setting
 * EMAIL_PROVIDER_API_KEY/EMAIL_SENDER_ADDRESS gets the safe fallback, not a
 * broken worker. */
export function selectFollowupDeliveryAdapter(env: {
  emailDeliveryEnabledRaw: string | undefined;
  apiKey: string | undefined;
  senderAddress: string | undefined;
  replyToAddress: string | undefined;
  appBaseUrl: string | undefined;
  unsubscribeSecret: string | undefined;
}): { adapter: FollowupDeliveryAdapter; mode: "email" | "canonical" } {
  if (isEmailDeliveryEnabled(env.emailDeliveryEnabledRaw)) {
    const providerConfig = resolveEmailProviderConfig({
      apiKey: env.apiKey,
      senderAddress: env.senderAddress,
      replyToAddress: env.replyToAddress,
      appBaseUrl: env.appBaseUrl,
      unsubscribeSecret: env.unsubscribeSecret,
    });
    if (providerConfig) {
      const provider = createResendEmailProvider(providerConfig.apiKey);
      const adapter = createEmailDeliveryAdapter({
        provider,
        senderConfig: {
          fromAddress: providerConfig.senderAddress,
          replyToAddress: providerConfig.replyToAddress,
        },
        appBaseUrl: providerConfig.appBaseUrl,
        unsubscribeSecret: providerConfig.unsubscribeSecret,
      });
      return { adapter, mode: "email" };
    }
  }
  return { adapter: canonicalMessageDeliveryAdapter, mode: "canonical" };
}

const DISABLING_VALUES = new Set(["false", "0", "no", "off"]);

/** Same "takes the raw value as an argument, not a process.env read"
 * shape as isAuthorized, for the same testability reason. Default (missing/
 * unset) is enabled — see the route handler's usage. Recognizes a small set
 * of common boolean-env spellings for "disabled" (not just the literal
 * "false") — an operator reaching for FOLLOWUP_WORKER_ENABLED=0 expecting
 * it to disable the worker and having that silently not work would be a
 * real production footgun, worse than being slightly permissive here. */
export function isWorkerEnabled(rawFlag: string | undefined): boolean {
  if (!rawFlag) return true;
  return !DISABLING_VALUES.has(rawFlag.trim().toLowerCase());
}

/** Exported for integration tests (see followups.process.integration.test.ts)
 * to call the real handler — real DB, real auth/kill-switch logic — with a
 * constructed Request, without needing an actual running HTTP server. */
export async function handleFollowupWorkerRequest(request: Request): Promise<Response> {
  const runId = randomUUID();
  const startedAt = Date.now();

  // ---- 1. Authenticate — before anything else, including the kill switch,
  // so an unauthenticated caller can never even learn whether the worker is
  // enabled or disabled. ----
  if (!isAuthorized(request, process.env.CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // ---- 2. Kill switch — server-side only, no UI (task section 11).
  // Default is enabled: an unset env var must not silently turn scheduled
  // follow-ups off in a fresh deployment. Set FOLLOWUP_WORKER_ENABLED=false
  // to disable. ----
  if (!isWorkerEnabled(process.env.FOLLOWUP_WORKER_ENABLED)) {
    return new Response(
      JSON.stringify({
        runId,
        disabled: true,
        message:
          "Follow-up worker is disabled (FOLLOWUP_WORKER_ENABLED=false) — no follow-ups were claimed or sent.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const batchSize = parsePositiveIntEnv(
    process.env.FOLLOWUP_WORKER_BATCH_SIZE,
    DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE,
  );
  const staleAfterMinutes = parsePositiveIntEnv(
    process.env.FOLLOWUP_STALE_PROCESSING_MINUTES,
    DEFAULT_STALE_PROCESSING_MINUTES,
  );
  // Product Track slice 7 (see ROADMAP.md): which delivery channel this run
  // uses. Reads the raw env vars exactly once, here — everything this
  // decision depends on stays pure/testable (selectFollowupDeliveryAdapter).
  const { adapter, mode: deliveryMode } = selectFollowupDeliveryAdapter({
    emailDeliveryEnabledRaw: process.env.EMAIL_DELIVERY_ENABLED,
    apiKey: process.env.EMAIL_PROVIDER_API_KEY,
    senderAddress: process.env.EMAIL_SENDER_ADDRESS,
    replyToAddress: process.env.EMAIL_REPLY_TO,
    appBaseUrl: process.env.APP_BASE_URL,
    unsubscribeSecret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
  });

  try {
    const now = new Date();
    // Recovery runs first, on every invocation — cheap (almost always finds
    // nothing) and means a crashed run gets cleaned up on the very next
    // scheduled tick rather than needing a separate recovery job.
    const recovery = await recoverStaleProcessingFollowups(supabaseAdmin, {
      now,
      staleAfterMinutes,
    });
    const result = await processDueFollowups(supabaseAdmin, { now, batchSize, adapter });
    const durationMs = Date.now() - startedAt;

    // Observability (task section 12): reuses the existing system_events
    // table/pattern (already used by widget.chat.ts) rather than a new
    // logging system. Only counts, the run id, and which delivery mode was
    // active — no message content, no lead/company identifiers, no email
    // addresses, no API keys, nothing personally identifiable (task
    // Phase 13).
    await supabaseAdmin.from("system_events").insert({
      kind: "success",
      source: "followups.worker",
      message: `run ${runId}: mode=${deliveryMode} claimed ${result.claimed}, sent ${result.sent}, cancelled ${result.cancelled}, skipped ${result.skipped}, retried ${result.retried}, failed ${result.failed}, recovered ${recovery.recovered}`,
      context: {
        runId,
        durationMs,
        batchSize,
        staleAfterMinutes,
        deliveryMode,
        ...result,
        recovery,
      },
    });

    return new Response(JSON.stringify({ runId, durationMs, deliveryMode, ...result, recovery }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;
    console.error("[followups.worker] run failed", { runId, durationMs });
    try {
      await supabaseAdmin.from("system_events").insert({
        kind: "error",
        source: "followups.worker",
        message: `run ${runId} failed: ${message.slice(0, 300)}`,
        context: { runId, durationMs },
      });
    } catch {
      /* best-effort logging — never let a logging failure mask the real error response */
    }
    // Deliberately generic — the full error is in system_events (server-side
    // only), never echoed back in the HTTP response body.
    return new Response(JSON.stringify({ runId, error: "internal_error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/internal/followups/process")({
  server: {
    handlers: {
      GET: async ({ request }) => handleFollowupWorkerRequest(request),
      POST: async ({ request }) => handleFollowupWorkerRequest(request),
    },
  },
});
