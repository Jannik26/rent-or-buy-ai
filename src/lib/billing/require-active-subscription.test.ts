import { describe, expect, it } from "vitest";
import {
  requireActiveSubscription,
  SubscriptionRequiredError,
  isSubscriptionRequiredMessage,
} from "@/lib/billing/require-active-subscription";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("requireActiveSubscription", () => {
  it("does not throw for trial", () => {
    expect(() =>
      requireActiveSubscription(
        { subscription_status: "trial", demo_expires_at: days(9), subscription_expires_at: null },
        NOW,
      ),
    ).not.toThrow();
  });

  it("does not throw for active", () => {
    expect(() =>
      requireActiveSubscription(
        { subscription_status: "active", demo_expires_at: null, subscription_expires_at: null },
        NOW,
      ),
    ).not.toThrow();
  });

  it("throws (fails closed) for an unclassified ordinary company — null status, no dates at all", () => {
    try {
      requireActiveSubscription(
        { subscription_status: null, demo_expires_at: null, subscription_expires_at: null },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SubscriptionRequiredError);
      expect((e as SubscriptionRequiredError).state).toBe("expired");
    }
  });

  it("throws SubscriptionRequiredError with state 'expired' for a trial past its grace period", () => {
    try {
      requireActiveSubscription(
        { subscription_status: "trial", demo_expires_at: days(-10), subscription_expires_at: null },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SubscriptionRequiredError);
      expect((e as SubscriptionRequiredError).state).toBe("expired");
      expect((e as SubscriptionRequiredError).message).toBe("SUBSCRIPTION_REQUIRED:expired");
    }
  });

  it("throws with state 'cancelled' for a cancelled subscription past grace period", () => {
    try {
      requireActiveSubscription(
        { subscription_status: "cancelled", demo_expires_at: null, subscription_expires_at: null },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as SubscriptionRequiredError).state).toBe("cancelled");
    }
  });

  it("throws with state 'locked' for a paused account", () => {
    try {
      requireActiveSubscription(
        { subscription_status: "paused", demo_expires_at: null, subscription_expires_at: null },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as SubscriptionRequiredError).state).toBe("locked");
    }
  });

  it("does not throw for a cancelled subscription still in its grace period", () => {
    expect(() =>
      requireActiveSubscription(
        {
          subscription_status: "cancelled",
          demo_expires_at: null,
          subscription_expires_at: days(10),
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it("does not throw for a trial still inside its 7-day post-trial grace period", () => {
    expect(() =>
      requireActiveSubscription(
        { subscription_status: "trial", demo_expires_at: days(-3), subscription_expires_at: null },
        NOW,
      ),
    ).not.toThrow();
  });

  it("throws with state 'locked' even when demo_expires_at would otherwise still be within grace", () => {
    try {
      requireActiveSubscription(
        { subscription_status: "paused", demo_expires_at: days(-1), subscription_expires_at: null },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as SubscriptionRequiredError).state).toBe("locked");
    }
  });
});

describe("isSubscriptionRequiredMessage", () => {
  it("recognizes the sentinel message", () => {
    expect(isSubscriptionRequiredMessage("SUBSCRIPTION_REQUIRED:expired")).toBe(true);
    expect(isSubscriptionRequiredMessage("SUBSCRIPTION_REQUIRED:locked")).toBe(true);
  });

  it("rejects unrelated messages", () => {
    expect(isSubscriptionRequiredMessage("Forbidden")).toBe(false);
    expect(isSubscriptionRequiredMessage("")).toBe(false);
    expect(isSubscriptionRequiredMessage(null)).toBe(false);
    expect(isSubscriptionRequiredMessage(undefined)).toBe(false);
  });
});
