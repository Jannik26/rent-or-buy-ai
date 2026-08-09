import { describe, expect, it } from "vitest";
import {
  isAuthorized,
  isWorkerEnabled,
  selectFollowupDeliveryAdapter,
  timingSafeEqualStrings,
} from "./followups.process";

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://example.com/api/internal/followups/process", { headers });
}

describe("timingSafeEqualStrings", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualStrings("secret-value", "secret-value")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqualStrings("secret-value", "secret-valuf")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqualStrings("short", "a-much-longer-secret-value")).toBe(false);
  });

  it("returns false for empty vs. non-empty", () => {
    expect(timingSafeEqualStrings("", "secret")).toBe(false);
  });
});

describe("isAuthorized", () => {
  const secret = "test-cron-secret-value";

  it("authorizes a matching Bearer token", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), secret)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(isAuthorized(requestWithAuth("Bearer wrong-value"), secret)).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isAuthorized(requestWithAuth(null), secret)).toBe(false);
  });

  it("rejects a header without the Bearer prefix", () => {
    expect(isAuthorized(requestWithAuth(secret), secret)).toBe(false);
  });

  it("rejects an empty Bearer token", () => {
    expect(isAuthorized(requestWithAuth("Bearer "), secret)).toBe(false);
  });

  it("fails closed when CRON_SECRET itself is not configured, even with a header present", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), undefined)).toBe(false);
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), "")).toBe(false);
  });

  it("is case-sensitive on the token value", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret.toUpperCase()}`), secret)).toBe(false);
  });
});

describe("isWorkerEnabled", () => {
  it("defaults to enabled when unset", () => {
    expect(isWorkerEnabled(undefined)).toBe(true);
  });

  it("defaults to enabled for an empty string", () => {
    expect(isWorkerEnabled("")).toBe(true);
  });

  it("is disabled for common falsy spellings (case/whitespace-insensitive)", () => {
    for (const value of ["false", "FALSE", " false ", "0", "no", "NO", "off", "Off"]) {
      expect(isWorkerEnabled(value)).toBe(false);
    }
  });

  it("stays enabled for anything else, including common truthy-looking values", () => {
    expect(isWorkerEnabled("true")).toBe(true);
    expect(isWorkerEnabled("1")).toBe(true);
    expect(isWorkerEnabled("yes")).toBe(true);
    expect(isWorkerEnabled("on")).toBe(true);
  });
});

describe("selectFollowupDeliveryAdapter", () => {
  const validEmailEnv = {
    emailDeliveryEnabledRaw: "true",
    apiKey: "re_test_key",
    senderAddress: "follow-up@mail.estateai.de",
    replyToAddress: "hello@estateai.de",
    appBaseUrl: "https://rent-or-buy-ai.vercel.app",
    unsubscribeSecret: "test-unsubscribe-secret",
    inboundDomain: undefined,
    inboundTokenSecret: undefined,
  };

  it("falls back to canonical when EMAIL_DELIVERY_ENABLED is unset, even with full provider config present", () => {
    const { mode } = selectFollowupDeliveryAdapter({
      ...validEmailEnv,
      emailDeliveryEnabledRaw: undefined,
    });
    expect(mode).toBe("canonical");
  });

  it("falls back to canonical when EMAIL_DELIVERY_ENABLED is explicitly false", () => {
    const { mode } = selectFollowupDeliveryAdapter({
      ...validEmailEnv,
      emailDeliveryEnabledRaw: "false",
    });
    expect(mode).toBe("canonical");
  });

  it("falls back to canonical when enabled but the API key is missing (never invents credentials)", () => {
    const { mode } = selectFollowupDeliveryAdapter({ ...validEmailEnv, apiKey: undefined });
    expect(mode).toBe("canonical");
  });

  it("falls back to canonical when enabled but the sender address is missing (no verified domain)", () => {
    const { mode } = selectFollowupDeliveryAdapter({ ...validEmailEnv, senderAddress: undefined });
    expect(mode).toBe("canonical");
  });

  it("falls back to canonical when enabled but the sender address is syntactically invalid", () => {
    const { mode } = selectFollowupDeliveryAdapter({
      ...validEmailEnv,
      senderAddress: "not-an-email",
    });
    expect(mode).toBe("canonical");
  });

  it("selects email only when both explicitly enabled AND fully configured", () => {
    const { mode, adapter } = selectFollowupDeliveryAdapter(validEmailEnv);
    expect(mode).toBe("email");
    expect(adapter).toBeDefined();
  });

  it("still selects email mode when inbound config is present (Reply-To routing is additive, never a precondition)", () => {
    const { mode, adapter } = selectFollowupDeliveryAdapter({
      ...validEmailEnv,
      inboundDomain: "reply.estateai.de",
      inboundTokenSecret: "test-inbound-secret",
    });
    expect(mode).toBe("email");
    expect(adapter).toBeDefined();
  });

  it("still selects email mode when inbound config is only half-present (falls back to static Reply-To, never blocks delivery)", () => {
    const { mode } = selectFollowupDeliveryAdapter({
      ...validEmailEnv,
      inboundDomain: "reply.estateai.de",
      inboundTokenSecret: undefined,
    });
    expect(mode).toBe("email");
  });

  it("never throws for any combination of missing/invalid inputs", () => {
    const combos = [
      {},
      { emailDeliveryEnabledRaw: "true" },
      { emailDeliveryEnabledRaw: "true", apiKey: "" },
      { emailDeliveryEnabledRaw: "garbage", apiKey: "x", senderAddress: "x", replyToAddress: "x" },
    ];
    for (const env of combos) {
      expect(() =>
        selectFollowupDeliveryAdapter({
          emailDeliveryEnabledRaw: undefined,
          apiKey: undefined,
          senderAddress: undefined,
          replyToAddress: undefined,
          appBaseUrl: undefined,
          unsubscribeSecret: undefined,
          inboundDomain: undefined,
          inboundTokenSecret: undefined,
          ...env,
        }),
      ).not.toThrow();
    }
  });
});
