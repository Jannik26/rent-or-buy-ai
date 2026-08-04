import { describe, expect, it } from "vitest";
import {
  profileSettingsSchema,
  emailChangeSchema,
  companySettingsSchema,
} from "@/lib/settings/schemas";

describe("profileSettingsSchema", () => {
  it("accepts a valid name", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "Max Mustermann" }).success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = profileSettingsSchema.safeParse({ full_name: "  Max  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.full_name).toBe("Max");
  });

  it("rejects whitespace-only input", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "   " }).success).toBe(false);
  });

  it("rejects a single character (below min 2)", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "M" }).success).toBe(false);
  });

  it("accepts exactly 2 characters (boundary)", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "Mo" }).success).toBe(true);
  });

  it("accepts exactly 120 characters (boundary)", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "a".repeat(120) }).success).toBe(true);
  });

  it("rejects 121 characters (over max)", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(profileSettingsSchema.safeParse({ full_name: "" }).success).toBe(false);
  });
});

describe("emailChangeSchema", () => {
  it("accepts a valid email", () => {
    expect(emailChangeSchema.safeParse({ email: "max@example.com" }).success).toBe(true);
  });

  it("normalizes case and whitespace", () => {
    const result = emailChangeSchema.safeParse({ email: "  MAX@EXAMPLE.COM  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("max@example.com");
  });

  it("rejects an invalid email", () => {
    expect(emailChangeSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an empty email", () => {
    expect(emailChangeSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("rejects plus-addressed emails", () => {
    expect(emailChangeSchema.safeParse({ email: "max+test@example.com" }).success).toBe(false);
  });

  it("rejects an email over 254 characters", () => {
    const longLocal = "a".repeat(250);
    expect(emailChangeSchema.safeParse({ email: `${longLocal}@ex.com` }).success).toBe(false);
  });
});

describe("companySettingsSchema", () => {
  const base = {
    name: "Musterfirma GmbH",
    greeting: "Hallo!",
    response_time: "24_hours" as const,
    privacy_url: "",
    terms_url: "",
  };

  it("accepts valid input with empty optional URLs", () => {
    expect(companySettingsSchema.safeParse(base).success).toBe(true);
  });

  it("rejects whitespace-only company name", () => {
    expect(companySettingsSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("rejects a name below min 2", () => {
    expect(companySettingsSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("accepts a name at exactly 150 characters", () => {
    expect(companySettingsSchema.safeParse({ ...base, name: "a".repeat(150) }).success).toBe(true);
  });

  it("rejects a name over 150 characters", () => {
    expect(companySettingsSchema.safeParse({ ...base, name: "a".repeat(151) }).success).toBe(false);
  });

  it("rejects an unknown response_time value", () => {
    expect(companySettingsSchema.safeParse({ ...base, response_time: "instant" }).success).toBe(
      false,
    );
  });

  it("accepts a valid https privacy_url", () => {
    expect(
      companySettingsSchema.safeParse({ ...base, privacy_url: "https://example.com/datenschutz" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-http(s) privacy_url", () => {
    expect(
      companySettingsSchema.safeParse({ ...base, privacy_url: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("rejects a malformed terms_url", () => {
    expect(companySettingsSchema.safeParse({ ...base, terms_url: "not a url" }).success).toBe(
      false,
    );
  });
});
