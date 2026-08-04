import { describe, expect, it } from "vitest";
import { isCompanyAllowedToUseWidget, type WidgetCompanyAccess } from "@/lib/billing/widget-access";
import { canAccessGatedFeatures, getSubscriptionState } from "@/lib/billing/subscription-status";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("isCompanyAllowedToUseWidget — canonical policy (unified with the shared engine)", () => {
  it("blocks a fully unclassified company (null status, no dates) — no more indefinite access", () => {
    const result = isCompanyAllowedToUseWidget(
      { id: "x", subscription_status: null, demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(result).toEqual({
      allowed: false,
      code: "ACCOUNT_INACTIVE",
      message: "Dieses EstateAI-Widget ist aktuell nicht aktiv.",
    });
  });

  it("grants a cancellation grace period — cancelled with a future subscription_expires_at stays allowed", () => {
    const result = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "cancelled",
        demo_expires_at: null,
        subscription_expires_at: days(30),
      },
      NOW,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("blocks cancelled once the grace period has ended", () => {
    const result = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "cancelled",
        demo_expires_at: null,
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(result).toEqual({
      allowed: false,
      code: "ACCOUNT_INACTIVE",
      message: "Dieses EstateAI-Widget ist aktuell nicht aktiv.",
    });
  });

  it("blocks paused (locked) immediately", () => {
    const result = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "paused",
        demo_expires_at: null,
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks explicit expired", () => {
    const result = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "expired",
        demo_expires_at: null,
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it("allows an active trial, allows one inside its 7-day grace period, and blocks one past grace with DEMO_EXPIRED", () => {
    const active = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "trial",
        demo_expires_at: days(9),
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(active).toEqual({ allowed: true });

    const inGrace = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "trial",
        demo_expires_at: days(-1),
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(inGrace).toEqual({ allowed: true });

    const lapsed = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "trial",
        demo_expires_at: days(-10),
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(lapsed).toEqual({
      allowed: false,
      code: "DEMO_EXPIRED",
      message: "Die 14-tägige EstateAI-Demo ist abgelaufen. Bitte kontaktieren Sie den Anbieter.",
    });
  });

  it("allows an unlimited active subscription and blocks a lapsed one with SUBSCRIPTION_EXPIRED", () => {
    const active = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "active",
        demo_expires_at: null,
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(active).toEqual({ allowed: true });

    const lapsed = isCompanyAllowedToUseWidget(
      {
        id: "x",
        subscription_status: "active",
        demo_expires_at: null,
        subscription_expires_at: days(-1),
      },
      NOW,
    );
    expect(lapsed).toEqual({
      allowed: false,
      code: "SUBSCRIPTION_EXPIRED",
      message: "Das Abonnement ist abgelaufen. Bitte kontaktieren Sie den Anbieter.",
    });
  });
});

describe("isCompanyAllowedToUseWidget — cross-surface consistency", () => {
  // Same input, same allow/block decision as the dashboard/embed-tab/lead-summary
  // guard (canAccessGatedFeatures(getSubscriptionState(...).state)) — proving
  // there is exactly one access policy, not a widget-specific variant of it.
  const CASES: WidgetCompanyAccess[] = [
    { id: "1", subscription_status: null, demo_expires_at: null, subscription_expires_at: null },
    {
      id: "2",
      subscription_status: null,
      demo_expires_at: days(-5),
      subscription_expires_at: null,
    },
    { id: "3", subscription_status: null, demo_expires_at: days(5), subscription_expires_at: null },
    {
      id: "4",
      subscription_status: null,
      demo_expires_at: null,
      subscription_expires_at: days(30),
    },
    {
      id: "5",
      subscription_status: "trial",
      demo_expires_at: days(9),
      subscription_expires_at: null,
    },
    {
      id: "6",
      subscription_status: "trial",
      demo_expires_at: days(-1),
      subscription_expires_at: null,
    },
    {
      id: "7",
      subscription_status: "active",
      demo_expires_at: null,
      subscription_expires_at: null,
    },
    {
      id: "8",
      subscription_status: "active",
      demo_expires_at: null,
      subscription_expires_at: days(-1),
    },
    {
      id: "9",
      subscription_status: "cancelled",
      demo_expires_at: null,
      subscription_expires_at: days(30),
    },
    {
      id: "10",
      subscription_status: "cancelled",
      demo_expires_at: null,
      subscription_expires_at: null,
    },
    {
      id: "11",
      subscription_status: "paused",
      demo_expires_at: null,
      subscription_expires_at: null,
    },
    {
      id: "12",
      subscription_status: "expired",
      demo_expires_at: null,
      subscription_expires_at: null,
    },
    {
      id: "13",
      subscription_status: "garbage",
      demo_expires_at: null,
      subscription_expires_at: null,
    },
  ];

  it.each(CASES)("case %#: %j agrees with canAccessGatedFeatures", (company) => {
    const widgetResult = isCompanyAllowedToUseWidget(company, NOW);
    const { state } = getSubscriptionState(company, NOW);
    expect(widgetResult.allowed).toBe(canAccessGatedFeatures(state));
  });
});
