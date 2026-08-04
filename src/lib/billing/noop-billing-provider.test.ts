import { describe, expect, it } from "vitest";
import { NoopBillingProvider } from "@/lib/billing/noop-billing-provider.server";
import { getSubscriptionState } from "@/lib/billing/subscription-status";
import type { BillingCompanyRow } from "@/lib/billing/billing-provider";

const provider = new NoopBillingProvider();

describe("NoopBillingProvider", () => {
  it("createCheckout never throws and never fakes a redirect", async () => {
    const result = await provider.createCheckout({ companyId: "c1" });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("createPortal never throws and never fakes a redirect", async () => {
    const result = await provider.createPortal({ companyId: "c1" });
    expect(result.status).toBe("unavailable");
  });

  it("cancelSubscription never throws and never fakes success", async () => {
    const result = await provider.cancelSubscription({ companyId: "c1" });
    expect(result.status).toBe("unavailable");
  });

  it("getSubscription matches a direct engine call on the same fixture row, and canManageBilling is false", async () => {
    const row: BillingCompanyRow = {
      plan: "professional",
      subscription_status: "trial",
      demo_expires_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      subscription_expires_at: null,
    };
    const snapshot = await provider.getSubscription({ companyId: "c1", companyRow: row });
    const direct = getSubscriptionState(row, new Date());

    expect(snapshot.state).toBe(direct.state);
    expect(snapshot.reason).toBe(direct.reason);
    expect(snapshot.plan).toBe("professional");
    expect(snapshot.rawStatus).toBe("trial");
    expect(snapshot.canManageBilling).toBe(false);
  });

  it("getSubscription handles a null plan/status row without throwing, and fails closed", async () => {
    const row: BillingCompanyRow = {
      plan: null,
      subscription_status: null,
      demo_expires_at: null,
      subscription_expires_at: null,
    };
    const snapshot = await provider.getSubscription({ companyId: "c1", companyRow: row });
    expect(snapshot.plan).toBeNull();
    expect(snapshot.state).toBe("expired");
    expect(snapshot.reason).toBe("unclassified");
  });
});
