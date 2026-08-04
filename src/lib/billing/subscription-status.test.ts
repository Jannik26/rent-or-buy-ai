import { describe, expect, it } from "vitest";
import {
  getSubscriptionState,
  getDaysRemaining,
  canAccessGatedFeatures,
  TRIAL_EXPIRING_THRESHOLD_DAYS,
  TRIAL_GRACE_PERIOD_DAYS,
  type SubscriptionState,
} from "@/lib/billing/subscription-status";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("TRIAL_EXPIRING_THRESHOLD_DAYS", () => {
  it("is fixed at 2 days", () => {
    expect(TRIAL_EXPIRING_THRESHOLD_DAYS).toBe(2);
  });
});

describe("TRIAL_GRACE_PERIOD_DAYS", () => {
  it("is fixed at 7 days", () => {
    expect(TRIAL_GRACE_PERIOD_DAYS).toBe(7);
  });
});

describe("getDaysRemaining", () => {
  it("returns null for missing/invalid input", () => {
    expect(getDaysRemaining(null, NOW)).toBeNull();
    expect(getDaysRemaining(undefined, NOW)).toBeNull();
    expect(getDaysRemaining("not-a-date", NOW)).toBeNull();
  });

  it("computes ceil-rounded days via epoch milliseconds", () => {
    expect(getDaysRemaining(days(9), NOW)).toBe(9);
    expect(getDaysRemaining(days(0.5), NOW)).toBe(1);
    expect(getDaysRemaining(days(-1), NOW)).toBe(-1);
  });
});

describe("getSubscriptionState — null status (fails closed)", () => {
  it("no date signals at all -> expired/unclassified (fails closed, not indefinite access)", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r).toEqual({
      state: "expired",
      reason: "unclassified",
      daysRemaining: null,
      relevantExpiryAt: null,
    });
  });

  it("undefined status behaves the same as null", () => {
    const r = getSubscriptionState(
      { subscription_status: undefined, demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("unclassified");
  });

  it("invalid ISO strings are treated as absent -> unclassified, not thrown", () => {
    const r = getSubscriptionState(
      {
        subscription_status: null,
        demo_expires_at: "garbage",
        subscription_expires_at: "also-garbage",
      },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("unclassified");
  });

  it("future demo_expires_at -> trial", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: days(9), subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("trial");
    expect(r.reason).toBe("trial_active");
  });

  it("past demo_expires_at within grace -> grace/trial_grace (a real signal exists, not unclassified)", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: days(-3), subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("grace");
    expect(r.reason).toBe("trial_grace");
  });

  it("past demo_expires_at beyond grace -> expired/trial_lapsed", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: days(-10), subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("trial_lapsed");
  });

  it("future subscription_expires_at -> active/unset_status_active_expiry", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: null, subscription_expires_at: days(30) },
      NOW,
    );
    expect(r.state).toBe("active");
    expect(r.reason).toBe("unset_status_active_expiry");
  });

  it("past subscription_expires_at -> expired/subscription_lapsed", () => {
    const r = getSubscriptionState(
      { subscription_status: null, demo_expires_at: null, subscription_expires_at: days(-10) },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("subscription_lapsed");
  });
});

describe("getSubscriptionState — trial", () => {
  it.each([
    [3, "trial", "trial_active"],
    [2, "trial_expiring", "trial_ending_soon"],
    [1, "trial_expiring", "trial_ending_soon"],
    // Exactly at trial end -> first instant of the 7-day grace window, not expired yet.
    [0, "grace", "trial_grace"],
    [-1, "grace", "trial_grace"],
  ] as const)("daysRemaining boundary %i -> %s/%s", (offset, expectedState, expectedReason) => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: days(offset),
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(r.state).toBe(expectedState);
    expect(r.reason).toBe(expectedReason);
  });

  it("unset demo_expires_at -> expired/trial_lapsed", () => {
    const r = getSubscriptionState(
      { subscription_status: "trial", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("trial_lapsed");
  });
});

describe("getSubscriptionState — 7-day post-trial grace period", () => {
  const demoExpiresAt = days(0); // trial ends exactly "now" in these cases' own reference frame
  const graceEndsAtMs = new Date(demoExpiresAt).getTime() + TRIAL_GRACE_PERIOD_DAYS * 86_400_000;

  it("exactly at trial end -> grace, daysRemaining == full grace window", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: demoExpiresAt,
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(r.state).toBe("grace");
    expect(r.reason).toBe("trial_grace");
    expect(r.daysRemaining).toBe(TRIAL_GRACE_PERIOD_DAYS);
  });

  it("first grace day (1ms after trial end) -> grace", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: demoExpiresAt,
        subscription_expires_at: null,
      },
      new Date(new Date(demoExpiresAt).getTime() + 1),
    );
    expect(r.state).toBe("grace");
    expect(r.reason).toBe("trial_grace");
  });

  it("last grace day (exactly graceEndsAt, 7 days after trial end) -> still grace, daysRemaining 0", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: demoExpiresAt,
        subscription_expires_at: null,
      },
      new Date(graceEndsAtMs),
    );
    expect(r.state).toBe("grace");
    expect(r.reason).toBe("trial_grace");
    expect(r.daysRemaining).toBe(0);
  });

  it("exactly 1ms after grace ends (7 days + 1ms after trial end) -> expired", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: demoExpiresAt,
        subscription_expires_at: null,
      },
      new Date(graceEndsAtMs + 1),
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("trial_lapsed");
  });

  it("well past grace (10 days after trial end) -> expired", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: demoExpiresAt,
        subscription_expires_at: null,
      },
      new Date(new Date(demoExpiresAt).getTime() + 10 * 86_400_000),
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("trial_lapsed");
  });

  it("future subscription_expires_at doesn't matter while a trial is merely in grace — status stays 'trial'", () => {
    // Grace derives purely from demo_expires_at once status is "trial"; a
    // stray subscription_expires_at value is not consulted in that branch.
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: days(-3),
        subscription_expires_at: days(30),
      },
      NOW,
    );
    expect(r.state).toBe("grace");
  });

  it("invalid demo_expires_at string during otherwise-trial status -> treated as absent, fails to expired", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "trial",
        demo_expires_at: "not-a-date",
        subscription_expires_at: null,
      },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("trial_lapsed");
  });

  it("locked always takes precedence over grace/trial dates", () => {
    // Even with demo_expires_at implying "still mid-trial" or "in grace",
    // an explicit admin/ops 'paused' status must win.
    const r = getSubscriptionState(
      { subscription_status: "paused", demo_expires_at: days(9), subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("locked");
    expect(r.reason).toBe("explicitly_locked");
    expect(canAccessGatedFeatures(r.state)).toBe(false);
  });
});

describe("getSubscriptionState — active", () => {
  it("no subscription_expires_at -> active/subscription_active (unlimited)", () => {
    const r = getSubscriptionState(
      { subscription_status: "active", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r).toMatchObject({ state: "active", reason: "subscription_active" });
  });

  it("future subscription_expires_at -> active", () => {
    const r = getSubscriptionState(
      { subscription_status: "active", demo_expires_at: null, subscription_expires_at: days(30) },
      NOW,
    );
    expect(r.state).toBe("active");
  });

  it("past subscription_expires_at -> expired/subscription_lapsed", () => {
    const r = getSubscriptionState(
      { subscription_status: "active", demo_expires_at: null, subscription_expires_at: days(-1) },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("subscription_lapsed");
  });
});

describe("getSubscriptionState — cancelled (grace period)", () => {
  it("future subscription_expires_at -> active/cancelled_grace_period (still has access)", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "cancelled",
        demo_expires_at: null,
        subscription_expires_at: days(10),
      },
      NOW,
    );
    expect(r.state).toBe("active");
    expect(r.reason).toBe("cancelled_grace_period");
  });

  it("no future expiry -> cancelled (blocked)", () => {
    const r = getSubscriptionState(
      { subscription_status: "cancelled", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("cancelled");
    expect(r.reason).toBe("explicitly_cancelled");
  });

  it("past subscription_expires_at -> cancelled (blocked, grace period over)", () => {
    const r = getSubscriptionState(
      {
        subscription_status: "cancelled",
        demo_expires_at: null,
        subscription_expires_at: days(-5),
      },
      NOW,
    );
    expect(r.state).toBe("cancelled");
  });
});

describe("getSubscriptionState — remaining raw statuses", () => {
  it("'paused' -> locked", () => {
    const r = getSubscriptionState(
      { subscription_status: "paused", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("locked");
    expect(r.reason).toBe("explicitly_locked");
  });

  it("'expired' -> expired/explicitly_expired", () => {
    const r = getSubscriptionState(
      { subscription_status: "expired", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("explicitly_expired");
  });

  it("unrecognized status -> expired/unknown_status", () => {
    const r = getSubscriptionState(
      { subscription_status: "garbage", demo_expires_at: null, subscription_expires_at: null },
      NOW,
    );
    expect(r.state).toBe("expired");
    expect(r.reason).toBe("unknown_status");
  });
});

describe("canAccessGatedFeatures", () => {
  it.each([
    ["trial", true],
    ["trial_expiring", true],
    ["grace", true],
    ["active", true],
    ["expired", false],
    ["cancelled", false],
    ["locked", false],
  ] as [SubscriptionState, boolean][])("%s -> %s", (state, expected) => {
    expect(canAccessGatedFeatures(state)).toBe(expected);
  });
});
