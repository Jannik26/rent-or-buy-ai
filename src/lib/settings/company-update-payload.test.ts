import { describe, expect, it } from "vitest";
import { buildCompanyUpdatePayload } from "@/lib/settings/company-update-payload";
import type { CompanySettingsFormValues } from "@/lib/settings/schemas";

const base: CompanySettingsFormValues = {
  name: "Musterfirma GmbH",
  greeting: "Hallo!",
  response_time: "24_hours",
  privacy_url: "",
  terms_url: "",
};

describe("buildCompanyUpdatePayload", () => {
  it("trims name and greeting", () => {
    const payload = buildCompanyUpdatePayload({
      ...base,
      name: "  Musterfirma  ",
      greeting: "  Hallo!  ",
    });
    expect(payload.name).toBe("Musterfirma");
    expect(payload.greeting).toBe("Hallo!");
  });

  it("converts blank privacy_url/terms_url to null", () => {
    const payload = buildCompanyUpdatePayload({ ...base, privacy_url: "   ", terms_url: "" });
    expect(payload.privacy_url).toBeNull();
    expect(payload.terms_url).toBeNull();
  });

  it("keeps non-blank URLs as trimmed strings", () => {
    const payload = buildCompanyUpdatePayload({
      ...base,
      privacy_url: "  https://example.com/datenschutz  ",
      terms_url: "https://example.com/agb",
    });
    expect(payload.privacy_url).toBe("https://example.com/datenschutz");
    expect(payload.terms_url).toBe("https://example.com/agb");
  });

  it("never leaks extra keys beyond the 5 whitelisted fields, even if present on the input", () => {
    const withExtraFields = {
      ...base,
      id: "evil-id",
      owner_id: "evil-owner",
      subscription_status: "active",
    } as CompanySettingsFormValues & Record<string, unknown>;

    const payload = buildCompanyUpdatePayload(withExtraFields);

    expect(Object.keys(payload).sort()).toEqual(
      ["greeting", "name", "privacy_url", "response_time", "terms_url"].sort(),
    );
  });
});
