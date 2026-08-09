import { describe, expect, it } from "vitest";
import { mapEventTypeToDeliveryStatus, parseResendWebhookPayload } from "./webhook-events";

// Payload shapes verified against Resend's own documented examples
// (https://resend.com/docs/webhooks/emails/bounced /complained).
const BOUNCED_PAYLOAD = {
  type: "email.bounced",
  created_at: "2026-11-22T23:41:12.126Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    to: ["lead@example.com"],
    from: "Acme <onboarding@resend.dev>",
    subject: "Sending this example",
    bounce: {
      message: "hard bounce",
      subType: "Suppressed",
      type: "Permanent",
    },
  },
};

const COMPLAINED_PAYLOAD = {
  type: "email.complained",
  created_at: "2026-02-22T23:41:12.126Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    to: ["lead@example.com"],
  },
};

const DELIVERED_PAYLOAD = {
  type: "email.delivered",
  data: { email_id: "abc-123", to: ["lead@example.com"] },
};

describe("parseResendWebhookPayload", () => {
  it("parses a bounced event, mapping bounce.type='Permanent' to our 'hard'", () => {
    const parsed = parseResendWebhookPayload(BOUNCED_PAYLOAD);
    expect(parsed).toEqual({
      type: "email.bounced",
      emailId: "56761188-7520-42d8-8898-ff6fc54ce618",
      recipients: ["lead@example.com"],
      bounceType: "hard",
    });
  });

  it("maps a non-Permanent bounce.type (e.g. Transient) to our 'soft'", () => {
    const parsed = parseResendWebhookPayload({
      type: "email.bounced",
      data: { email_id: "x", to: ["lead@example.com"], bounce: { type: "Transient" } },
    });
    expect(parsed?.bounceType).toBe("soft");
  });

  it("treats an ambiguous/unknown bounce.type as 'soft', not 'hard' (conservative default)", () => {
    const parsed = parseResendWebhookPayload({
      type: "email.bounced",
      data: { email_id: "x", to: ["lead@example.com"], bounce: { type: "Undetermined" } },
    });
    expect(parsed?.bounceType).toBe("soft");
  });

  it("parses a complained event with no bounce field", () => {
    const parsed = parseResendWebhookPayload(COMPLAINED_PAYLOAD);
    expect(parsed).toEqual({
      type: "email.complained",
      emailId: "56761188-7520-42d8-8898-ff6fc54ce618",
      recipients: ["lead@example.com"],
      bounceType: null,
    });
  });

  it("parses a delivered event", () => {
    const parsed = parseResendWebhookPayload(DELIVERED_PAYLOAD);
    expect(parsed).toEqual({
      type: "email.delivered",
      emailId: "abc-123",
      recipients: ["lead@example.com"],
      bounceType: null,
    });
  });

  it("still parses an unrecognized-but-well-shaped event type (forward-compatible)", () => {
    const parsed = parseResendWebhookPayload({
      type: "email.some_future_event",
      data: { email_id: "x", to: ["lead@example.com"] },
    });
    expect(parsed?.type).toBe("email.some_future_event");
    expect(parsed?.emailId).toBe("x");
  });

  it("returns null for a payload missing a string type", () => {
    expect(parseResendWebhookPayload({ data: {} })).toBeNull();
    expect(parseResendWebhookPayload({ type: 123 })).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseResendWebhookPayload(null)).toBeNull();
    expect(parseResendWebhookPayload("a string")).toBeNull();
    expect(parseResendWebhookPayload(42)).toBeNull();
    expect(parseResendWebhookPayload(undefined)).toBeNull();
  });

  it("handles a missing/malformed data object without throwing", () => {
    const parsed = parseResendWebhookPayload({ type: "email.sent" });
    expect(parsed).toEqual({ type: "email.sent", emailId: null, recipients: [], bounceType: null });
  });

  it("filters non-string entries out of a malformed 'to' array instead of throwing", () => {
    const parsed = parseResendWebhookPayload({
      type: "email.delivered",
      data: { email_id: "x", to: ["a@example.com", 42, null, "b@example.com"] },
    });
    expect(parsed?.recipients).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("mapEventTypeToDeliveryStatus", () => {
  it("maps the four event types this slice acts on", () => {
    expect(mapEventTypeToDeliveryStatus("email.delivered")).toBe("delivered");
    expect(mapEventTypeToDeliveryStatus("email.bounced")).toBe("bounced");
    expect(mapEventTypeToDeliveryStatus("email.complained")).toBe("complained");
    expect(mapEventTypeToDeliveryStatus("email.delivery_delayed")).toBe("deferred");
  });

  it("deliberately does not map email.sent — the worker already sets 'accepted' synchronously", () => {
    expect(mapEventTypeToDeliveryStatus("email.sent")).toBeNull();
  });

  it("returns null for opened/clicked and any unrecognized event type", () => {
    expect(mapEventTypeToDeliveryStatus("email.opened")).toBeNull();
    expect(mapEventTypeToDeliveryStatus("email.clicked")).toBeNull();
    expect(mapEventTypeToDeliveryStatus("email.some_future_event")).toBeNull();
  });
});
