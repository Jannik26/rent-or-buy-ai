import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildReplyAddress,
  extractReplyToken,
  signReplyToken,
  verifyReplyToken,
} from "./reply-token";

const SECRET = "test-inbound-token-secret";
const PAYLOAD = { conversationId: "c0000000-0000-0000-0000-000000000001" };

describe("signReplyToken / verifyReplyToken", () => {
  it("round-trips a valid token", () => {
    const token = signReplyToken(PAYLOAD, SECRET);
    expect(verifyReplyToken(token, SECRET)).toEqual({ ok: true, payload: PAYLOAD });
  });

  it("is deterministic for the same conversationId (no storage needed)", () => {
    expect(signReplyToken(PAYLOAD, SECRET)).toBe(signReplyToken(PAYLOAD, SECRET));
  });

  it("rejects a token signed with a different secret", () => {
    const token = signReplyToken(PAYLOAD, "a-different-secret");
    expect(verifyReplyToken(token, SECRET)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a token signed with the unsubscribe secret domain (cross-purpose reuse)", () => {
    // Simulates an attacker trying to reuse an unsubscribe-flavored secret
    // value for reply routing — different secrets must never validate
    // each other's tokens.
    const token = signReplyToken(PAYLOAD, "email-unsubscribe-secret-value");
    expect(verifyReplyToken(token, "email-inbound-token-secret-value")).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a tampered conversationId even with the original signature suffix", () => {
    const token = signReplyToken(PAYLOAD, SECRET);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ conversationId: "c0000000-0000-0000-0000-000000000999" }),
      "utf8",
    ).toString("base64url");
    expect(verifyReplyToken(`${forgedPayload}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects malformed tokens without throwing", () => {
    for (const garbage of ["", ".", "..", "not-a-token", "a.b.c"]) {
      expect(() => verifyReplyToken(garbage, SECRET)).not.toThrow();
    }
    expect(verifyReplyToken("", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a validly-signed token whose payload is missing conversationId", () => {
    // Hand-built with the same algorithm (not exported from the module)
    // to reach the invalid_payload branch specifically, past a passing
    // signature check.
    const encodedPayload = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString(
      "base64url",
    );
    const signature = createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
    const result = verifyReplyToken(`${encodedPayload}.${signature}`, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
  });
});

describe("buildReplyAddress / extractReplyToken", () => {
  it("round-trips a token through the reply+<token>@<domain> convention", () => {
    const token = signReplyToken(PAYLOAD, SECRET);
    const address = buildReplyAddress(token, "reply.estateai.de");
    expect(address).toBe(`reply+${token}@reply.estateai.de`);
    expect(extractReplyToken(address)).toBe(token);
  });

  it("extractReplyToken returns null for an address without the reply+ prefix", () => {
    expect(extractReplyToken("hello@reply.estateai.de")).toBeNull();
  });

  it("extractReplyToken returns null for an address with no @", () => {
    expect(extractReplyToken("not-an-email")).toBeNull();
  });

  it("extractReplyToken returns null for reply+ with nothing after it", () => {
    expect(extractReplyToken("reply+@reply.estateai.de")).toBeNull();
  });

  it("extractReplyToken never throws on garbage input", () => {
    for (const garbage of ["", "@", "reply+", "a+b+c@d@e"]) {
      expect(() => extractReplyToken(garbage)).not.toThrow();
    }
  });
});
