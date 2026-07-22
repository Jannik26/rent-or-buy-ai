import { describe, expect, it } from "vitest";
import { isPlusAddressed, normalizeEmail } from "@/lib/validate-email";

describe("isPlusAddressed", () => {
  it.each(["john+test@gmail.com", "max+demo@outlook.com", "user+123@yahoo.com"])(
    "rejects %s",
    (email) => {
      expect(isPlusAddressed(normalizeEmail(email))).toBe(true);
    },
  );

  it.each(["john@gmail.com", "max.mustermann@outlook.com", "user_123@yahoo.com"])(
    "accepts %s",
    (email) => {
      expect(isPlusAddressed(normalizeEmail(email))).toBe(false);
    },
  );

  it("trims whitespace before validating", () => {
    expect(normalizeEmail("  john@gmail.com  ")).toBe("john@gmail.com");
    expect(isPlusAddressed(normalizeEmail("  john+test@gmail.com  "))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(normalizeEmail("JOHN+TEST@GMAIL.COM")).toBe("john+test@gmail.com");
    expect(isPlusAddressed(normalizeEmail("JOHN+TEST@GMAIL.COM"))).toBe(true);
    expect(isPlusAddressed(normalizeEmail("JOHN@GMAIL.COM"))).toBe(false);
  });
});
