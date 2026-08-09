import { describe, expect, it } from "vitest";
import { findReplyAddress, parseInboundWebhookPayload } from "./inbound-webhook-events";

// Payload shape verified against Resend's documented `email.received`
// webhook example (task Phase 1) — metadata only, no text/html body.
const RECEIVED_PAYLOAD = {
  type: "email.received",
  created_at: "2026-11-22T23:41:12.126Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    from: '"Lead Name" <lead@example.com>',
    to: ["reply+abc123.def456@reply.estateai.de"],
    subject: "Re: Ihre Anfrage",
    attachments: [{ id: "att-1", filename: "grundriss.pdf" }],
  },
};

describe("parseInboundWebhookPayload", () => {
  it("parses a well-formed email.received payload", () => {
    expect(parseInboundWebhookPayload(RECEIVED_PAYLOAD)).toEqual({
      type: "email.received",
      emailId: "56761188-7520-42d8-8898-ff6fc54ce618",
      from: '"Lead Name" <lead@example.com>',
      to: ["reply+abc123.def456@reply.estateai.de"],
      attachmentCount: 1,
    });
  });

  it("returns null for a payload with no string type", () => {
    expect(parseInboundWebhookPayload({ data: {} })).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseInboundWebhookPayload(null)).toBeNull();
    expect(parseInboundWebhookPayload("email.received")).toBeNull();
    expect(parseInboundWebhookPayload(42)).toBeNull();
  });

  it("defaults missing/malformed data fields safely rather than throwing", () => {
    expect(parseInboundWebhookPayload({ type: "email.received" })).toEqual({
      type: "email.received",
      emailId: null,
      from: null,
      to: [],
      attachmentCount: 0,
    });
  });

  it("filters non-string entries out of `to` instead of throwing", () => {
    const parsed = parseInboundWebhookPayload({
      type: "email.received",
      data: { to: ["a@example.com", 42, null, "b@example.com"] },
    });
    expect(parsed?.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("counts attachments without inspecting their shape", () => {
    const parsed = parseInboundWebhookPayload({
      type: "email.received",
      data: { attachments: [{}, {}, {}] },
    });
    expect(parsed?.attachmentCount).toBe(3);
  });
});

describe("findReplyAddress", () => {
  it("finds the reply+ address matching the configured inbound domain", () => {
    expect(
      findReplyAddress(["someone-else@example.com", "reply+TOKEN123@reply.estateai.de"], "reply.estateai.de"),
    ).toBe("reply+TOKEN123@reply.estateai.de");
  });

  it("matches the domain case-insensitively but preserves the token's case exactly", () => {
    expect(findReplyAddress(["reply+MixedCaseToken-1@REPLY.ESTATEAI.DE"], "reply.estateai.de")).toBe(
      "reply+MixedCaseToken-1@REPLY.ESTATEAI.DE",
    );
  });

  it("unwraps a display-name-wrapped address without lowercasing the token", () => {
    expect(
      findReplyAddress(['"EstateAI" <reply+AbC123@reply.estateai.de>'], "reply.estateai.de"),
    ).toBe("reply+AbC123@reply.estateai.de");
  });

  it("returns null when no recipient matches the inbound domain", () => {
    expect(findReplyAddress(["someone@other-domain.de"], "reply.estateai.de")).toBeNull();
  });

  it("returns null for an empty recipient list", () => {
    expect(findReplyAddress([], "reply.estateai.de")).toBeNull();
  });

  it("returns null when the inbound domain itself is blank", () => {
    expect(findReplyAddress(["reply+token@reply.estateai.de"], "")).toBeNull();
  });

  it("skips malformed entries without an @ instead of throwing", () => {
    expect(findReplyAddress(["not-an-address", "reply+token@reply.estateai.de"], "reply.estateai.de")).toBe(
      "reply+token@reply.estateai.de",
    );
  });

  it("does not match a recipient on an unrelated domain even with a reply+ local part", () => {
    expect(findReplyAddress(["reply+token@evil.com"], "reply.estateai.de")).toBeNull();
  });
});
