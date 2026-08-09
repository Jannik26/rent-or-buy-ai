import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "test-unsubscribe-secret";
const PAYLOAD = { companyId: "e2a7b36e-d374-4895-99ce-f5b2f21eb993", email: "lead@example.com" };

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trips a valid token", () => {
    const token = signUnsubscribeToken(PAYLOAD, SECRET);
    const result = verifyUnsubscribeToken(token, SECRET);
    expect(result).toEqual({ ok: true, payload: PAYLOAD });
  });

  it("is deterministic — signing the same payload twice yields the same token (no server-side storage needed)", () => {
    expect(signUnsubscribeToken(PAYLOAD, SECRET)).toBe(signUnsubscribeToken(PAYLOAD, SECRET));
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken(PAYLOAD, "a-different-secret");
    const result = verifyUnsubscribeToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a tampered payload (company/email swapped for a different one) even with the original signature suffix", () => {
    const token = signUnsubscribeToken(PAYLOAD, SECRET);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...PAYLOAD, email: "someone-else@example.com" }),
      "utf8",
    ).toString("base64url");
    const forgedToken = `${forgedPayload}.${signature}`;
    expect(verifyUnsubscribeToken(forgedToken, SECRET)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a malformed token (no dot separator)", () => {
    expect(verifyUnsubscribeToken("not-a-real-token", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects an empty token", () => {
    expect(verifyUnsubscribeToken("", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a token with an empty payload or empty signature segment", () => {
    expect(verifyUnsubscribeToken(".somesignature", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyUnsubscribeToken("somepayload.", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a syntactically valid-looking token whose decoded payload isn't the expected shape", () => {
    // A correctly-signed token, but for a payload missing the required fields.
    const encodedPayload = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString(
      "base64url",
    );
    const forged = signUnsubscribeToken as unknown as (p: object, s: string) => string;
    const token = forged({ foo: "bar" }, SECRET);
    expect(encodedPayload.length).toBeGreaterThan(0); // sanity, not a real assertion target
    const result = verifyUnsubscribeToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_payload");
  });

  it("never throws for arbitrary garbage input", () => {
    for (const garbage of ["", ".", "..", "a.b.c", "🎉.🎉", "null", "undefined"]) {
      expect(() => verifyUnsubscribeToken(garbage, SECRET)).not.toThrow();
    }
  });
});
