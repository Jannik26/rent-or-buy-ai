import type { SubscriptionState } from "@/lib/billing/subscription-status";

// Provider-agnostic billing contract. Today only a no-op implementation
// exists (no payment provider is configured anywhere in this project's env
// vars) — this interface is the single swap point for a future Stripe
// integration, so UI code never needs provider-specific branches.

export type CheckoutResult =
  | { status: "unavailable"; reason: string }
  | { status: "redirect"; url: string };

export type PortalResult =
  | { status: "unavailable"; reason: string }
  | { status: "redirect"; url: string };

export type CancelResult = { status: "unavailable"; reason: string } | { status: "cancelled" };

export type BillingCompanyRow = {
  plan: string | null;
  subscription_status: string | null;
  demo_expires_at: string | null;
  subscription_expires_at: string | null;
};

export type BillingPlan = "basic" | "professional" | "enterprise";

export type SubscriptionSnapshot = {
  plan: BillingPlan | null;
  state: SubscriptionState;
  reason: string;
  rawStatus: string | null;
  daysRemaining: number | null;
  relevantExpiryAt: string | null;
  /** false for the no-op provider — gates whether "Abo verwalten" is shown as a real action. */
  canManageBilling: boolean;
};

export interface BillingProvider {
  createCheckout(input: { companyId: string; plan?: BillingPlan }): Promise<CheckoutResult>;
  createPortal(input: { companyId: string }): Promise<PortalResult>;
  /** Kept for interface completeness / the next Stripe phase — not exposed
   * via any server function or UI button today, since no visible
   * cancellation action exists anywhere in the app yet. */
  cancelSubscription(input: { companyId: string }): Promise<CancelResult>;
  getSubscription(input: {
    companyId: string;
    companyRow: BillingCompanyRow;
  }): Promise<SubscriptionSnapshot>;
}
