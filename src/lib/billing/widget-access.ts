import {
  canAccessGatedFeatures,
  getSubscriptionState,
  type SubscriptionInput,
} from "@/lib/billing/subscription-status";

// Thin adapter over the shared engine — the public widget chat endpoint now
// follows the exact same derived access decision as the dashboard, the
// Embed tab, the AI lead-summary guard, and Settings' billing tab. Only the
// EXTERNAL response shape is widget-specific (3 error codes, German
// messages, unchanged since this is the protected demo-flow path) — the
// underlying allow/block decision is never computed a second time here.
//
// This used to carry two deliberate overrides (null status always allowed
// even with a lapsed trial date; "cancelled" always blocked even inside the
// grace period) preserved for byte-identical legacy behavior. Both are now
// removed: every real company gets an explicit trial stamped at creation
// (see the sync migration), the demo company has explicit permanent data,
// and no current real company was in either of those two states — see
// widget-access.test.ts for the verification.

export type WidgetCompanyAccess = {
  id: string;
  subscription_status: string | null;
  demo_expires_at: string | null;
  subscription_expires_at: string | null;
};

export type WidgetAccessResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "DEMO_EXPIRED" | "SUBSCRIPTION_EXPIRED" | "ACCOUNT_INACTIVE";
      message: string;
    };

export function isCompanyAllowedToUseWidget(
  company: WidgetCompanyAccess,
  now: Date = new Date(),
): WidgetAccessResult {
  const input: SubscriptionInput = {
    subscription_status: company.subscription_status,
    demo_expires_at: company.demo_expires_at,
    subscription_expires_at: company.subscription_expires_at,
  };
  const { state, reason } = getSubscriptionState(input, now);

  if (canAccessGatedFeatures(state)) {
    return { allowed: true };
  }

  if (reason === "trial_lapsed") {
    return {
      allowed: false,
      code: "DEMO_EXPIRED",
      message: "Die 14-tägige EstateAI-Demo ist abgelaufen. Bitte kontaktieren Sie den Anbieter.",
    };
  }
  if (reason === "subscription_lapsed") {
    return {
      allowed: false,
      code: "SUBSCRIPTION_EXPIRED",
      message: "Das Abonnement ist abgelaufen. Bitte kontaktieren Sie den Anbieter.",
    };
  }
  // "explicitly_cancelled" | "explicitly_locked" | "explicitly_expired" |
  // "unknown_status" | "unclassified"
  return {
    allowed: false,
    code: "ACCOUNT_INACTIVE",
    message: "Dieses EstateAI-Widget ist aktuell nicht aktiv.",
  };
}
