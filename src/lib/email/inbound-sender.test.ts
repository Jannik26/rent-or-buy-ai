import { describe, expect, it } from "vitest";
import { normalizeEmailAddressForComparison, verifySender } from "./inbound-sender";

describe("normalizeEmailAddressForComparison", () => {
  it("extracts the bare address from a display-name-wrapped From header", () => {
    expect(normalizeEmailAddressForComparison('"Max Mustermann" <max@example.com>')).toBe(
      "max@example.com",
    );
  });

  it("handles a plain address with no display name", () => {
    expect(normalizeEmailAddressForComparison("max@example.com")).toBe("max@example.com");
  });

  it("lowercases and trims", () => {
    expect(normalizeEmailAddressForComparison("  Max@Example.COM  ")).toBe("max@example.com");
  });

  it("handles a display name containing angle-bracket-like characters safely", () => {
    expect(normalizeEmailAddressForComparison("Max <3 Mustermann <max@example.com>")).toBe(
      "max@example.com",
    );
  });
});

describe("verifySender", () => {
  it("passes when the inbound From matches the lead's email exactly", () => {
    expect(verifySender("lead@example.com", "lead@example.com")).toEqual({ ok: true });
  });

  it("passes case-insensitively and with a display name wrapper", () => {
    expect(verifySender('"Lead Name" <Lead@Example.com>', "lead@example.com")).toEqual({
      ok: true,
    });
  });

  it("fails when the lead has no email on file at all", () => {
    expect(verifySender("someone@example.com", null)).toEqual({
      ok: false,
      reason: "no_lead_email_on_file",
    });
  });

  it("fails when the inbound sender doesn't match the lead's email (spoofing/wrong-address case)", () => {
    expect(verifySender("attacker@evil.com", "lead@example.com")).toEqual({
      ok: false,
      reason: "sender_mismatch",
    });
  });

  it("fails for a similar-but-different address (no fuzzy matching)", () => {
    expect(verifySender("lead@example.com.evil.com", "lead@example.com")).toEqual({
      ok: false,
      reason: "sender_mismatch",
    });
  });
});
