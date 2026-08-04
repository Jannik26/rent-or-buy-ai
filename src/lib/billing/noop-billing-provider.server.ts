import { getSubscriptionState } from "@/lib/billing/subscription-status";
import type {
  BillingCompanyRow,
  BillingPlan,
  BillingProvider,
  CancelResult,
  CheckoutResult,
  PortalResult,
  SubscriptionSnapshot,
} from "@/lib/billing/billing-provider";

const CHECKOUT_UNAVAILABLE =
  "Die Selbstbedienungs-Kasse ist noch nicht verfügbar. Bitte kontaktieren Sie uns.";
const PORTAL_UNAVAILABLE =
  "Das Abrechnungsportal ist noch nicht verfügbar. Bitte kontaktieren Sie uns.";
const CANCEL_UNAVAILABLE =
  "Die Online-Kündigung ist noch nicht verfügbar. Bitte kontaktieren Sie uns.";

/**
 * No payment provider is configured anywhere in this project today — this
 * implementation never throws and never fakes a success/redirect result,
 * so the UI can always render a real, honest "not connected yet" state
 * instead of pretending to charge anything.
 */
export class NoopBillingProvider implements BillingProvider {
  async createCheckout(_input: { companyId: string; plan?: BillingPlan }): Promise<CheckoutResult> {
    return { status: "unavailable", reason: CHECKOUT_UNAVAILABLE };
  }

  async createPortal(_input: { companyId: string }): Promise<PortalResult> {
    return { status: "unavailable", reason: PORTAL_UNAVAILABLE };
  }

  async cancelSubscription(_input: { companyId: string }): Promise<CancelResult> {
    return { status: "unavailable", reason: CANCEL_UNAVAILABLE };
  }

  async getSubscription(input: {
    companyId: string;
    companyRow: BillingCompanyRow;
  }): Promise<SubscriptionSnapshot> {
    const { companyRow } = input;
    const { state, reason, daysRemaining, relevantExpiryAt } = getSubscriptionState(
      companyRow,
      new Date(),
    );
    return {
      plan: (companyRow.plan as BillingPlan | null) ?? null,
      state,
      reason,
      rawStatus: companyRow.subscription_status,
      daysRemaining,
      relevantExpiryAt,
      canManageBilling: false,
    };
  }
}
