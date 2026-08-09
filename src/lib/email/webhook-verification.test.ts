import { Webhook } from "svix";
import { describe, expect, it } from "vitest";
import { verifyResendWebhook } from "./webhook-verification";

// A real, valid Svix signing secret shape (whsec_<base64>) — test-only,
// never a real Resend secret. Signed with the actual `svix` library
// (Resend's webhooks are delivered via Svix, confirmed against Resend's
// own docs) so these tests exercise the real verification algorithm, not
// a hand-rolled stand-in.
const SECRET = `whsec_${Buffer.from("test-only-webhook-signing-secret").toString("base64")}`;
const PAYLOAD = JSON.stringify({
  type: "email.bounced",
  data: { email_id: "abc-123", to: ["lead@example.com"] },
});

function signValidRequest(payload = PAYLOAD, secret = SECRET) {
  const webhook = new Webhook(secret);
  const id = "msg_test_only_123";
  const timestamp = new Date();
  const signature = webhook.sign(id, timestamp, payload);
  return {
    rawBody: payload,
    headers: {
      svixId: id,
      svixTimestamp: Math.floor(timestamp.getTime() / 1000).toString(),
      svixSignature: signature,
    },
  };
}

describe("verifyResendWebhook", () => {
  it("accepts a genuinely validly-signed request and returns the parsed payload", () => {
    const request = signValidRequest();
    const result = verifyResendWebhook({ ...request, secret: SECRET });
    expect(result).toEqual({ ok: true, payload: JSON.parse(PAYLOAD) });
  });

  it("rejects a request signed with a different secret", () => {
    const request = signValidRequest();
    const otherSecret = `whsec_${Buffer.from("a-completely-different-secret").toString("base64")}`;
    const result = verifyResendWebhook({ ...request, secret: otherSecret });
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a tampered body (signature no longer matches the modified payload)", () => {
    const request = signValidRequest();
    const tamperedBody = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "a-different-email-id", to: ["attacker@example.com"] },
    });
    const result = verifyResendWebhook({ ...request, rawBody: tamperedBody, secret: SECRET });
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a request missing the svix-id header", () => {
    const request = signValidRequest();
    const result = verifyResendWebhook({
      rawBody: request.rawBody,
      headers: { ...request.headers, svixId: null },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a request missing the svix-timestamp header", () => {
    const request = signValidRequest();
    const result = verifyResendWebhook({
      rawBody: request.rawBody,
      headers: { ...request.headers, svixTimestamp: null },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a request missing the svix-signature header", () => {
    const request = signValidRequest();
    const result = verifyResendWebhook({
      rawBody: request.rawBody,
      headers: { ...request.headers, svixSignature: null },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a request with all headers missing entirely", () => {
    const result = verifyResendWebhook({
      rawBody: PAYLOAD,
      headers: { svixId: null, svixTimestamp: null, svixSignature: null },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a garbage signature value without throwing", () => {
    const request = signValidRequest();
    const result = verifyResendWebhook({
      rawBody: request.rawBody,
      headers: { ...request.headers, svixSignature: "v1,not-a-real-signature" },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("never throws for any malformed input combination", () => {
    expect(() =>
      verifyResendWebhook({
        rawBody: "",
        headers: { svixId: "x", svixTimestamp: "not-a-number", svixSignature: "v1,x" },
        secret: SECRET,
      }),
    ).not.toThrow();
  });
});
