import { describe, expect, it } from "vitest";
import {
  countKnownPreferenceCriteria,
  extractLeadPreferences,
  parseBudgetToNumber,
  parseMinRooms,
  parsePropertyType,
  UNKNOWN,
} from "@/lib/matching/lead-preferences";

describe("parseBudgetToNumber", () => {
  // Exact formats observed in the real, connected project's leads.budget
  // column during this slice's data investigation (see ROADMAP.md) — not
  // invented fixtures.
  it("parses a German thousands-separated amount with currency symbol", () => {
    expect(parseBudgetToNumber("4.500.000 €")).toBe(4_500_000);
  });

  it("parses a bare integer with no separators", () => {
    expect(parseBudgetToNumber("400000")).toBe(400_000);
  });

  it("parses a smaller thousands-separated amount", () => {
    expect(parseBudgetToNumber("500.000 €")).toBe(500_000);
  });

  it("parses a rent figure with 'Euro Kaltmiete' suffix", () => {
    expect(parseBudgetToNumber("550 Euro Kaltmiete")).toBe(550);
  });

  it("returns unknown for null/empty", () => {
    expect(parseBudgetToNumber(null)).toBe(UNKNOWN);
    expect(parseBudgetToNumber("")).toBe(UNKNOWN);
    expect(parseBudgetToNumber("   ")).toBe(UNKNOWN);
  });

  it("returns unknown for a non-numeric or ambiguous value rather than guessing", () => {
    expect(parseBudgetToNumber("VB")).toBe(UNKNOWN);
    expect(parseBudgetToNumber("bis zu 500k")).toBe(UNKNOWN);
    expect(parseBudgetToNumber("ca. 400.000-500.000")).toBe(UNKNOWN);
  });

  it("parses a decimal comma amount", () => {
    expect(parseBudgetToNumber("299.500,50")).toBe(299_500.5);
  });
});

describe("parsePropertyType", () => {
  it("maps real observed values to the controlled vocabulary", () => {
    expect(parsePropertyType("3-Zimmer-Wohnung")).toBe("wohnung");
    expect(parsePropertyType("Grundstück")).toBe("grundstueck");
    expect(parsePropertyType("Haus")).toBe("haus");
    expect(parsePropertyType("Haus (4 Zimmer)")).toBe("haus");
    expect(parsePropertyType("Wohnung")).toBe("wohnung");
  });

  it("returns unknown for null/empty/unrecognized text", () => {
    expect(parsePropertyType(null)).toBe(UNKNOWN);
    expect(parsePropertyType("")).toBe(UNKNOWN);
    expect(parsePropertyType("irgendetwas Unbekanntes")).toBe(UNKNOWN);
  });
});

describe("parseMinRooms", () => {
  it("extracts a room count tied to the literal word 'Zimmer'", () => {
    expect(parseMinRooms("3-Zimmer-Wohnung")).toBe(3);
    expect(parseMinRooms("Haus (4 Zimmer)")).toBe(4);
    expect(parseMinRooms("mindestens 3,5 Zimmer bitte")).toBe(3.5);
  });

  it("checks multiple sources in order and returns unknown if none match", () => {
    expect(parseMinRooms(null, "5 Zimmer")).toBe(5);
    expect(parseMinRooms("kein Zimmer-Hinweis hier", null)).toBe(UNKNOWN);
    expect(parseMinRooms(null, null)).toBe(UNKNOWN);
  });

  it("never fabricates a count from unrelated numbers", () => {
    expect(parseMinRooms("Baujahr 1998")).toBe(UNKNOWN);
  });
});

describe("extractLeadPreferences", () => {
  it("is not applicable for a seller-side intent (verkauf)", () => {
    const prefs = extractLeadPreferences({
      intent: "verkauf",
      budget: "500.000 €",
      property_type: "Haus",
      object_desc: null,
      location: "Berlin",
    });
    expect(prefs.applicable).toBe(false);
    expect(prefs.transactionType).toBe(UNKNOWN);
  });

  it("is not applicable for bewertung/sonstiges/unbekannt", () => {
    for (const intent of ["bewertung", "sonstiges", "unbekannt"] as const) {
      expect(
        extractLeadPreferences({
          intent,
          budget: null,
          property_type: null,
          object_desc: null,
          location: null,
        }).applicable,
      ).toBe(false);
    }
  });

  it("is applicable for kauf with transactionType 'kauf'", () => {
    const prefs = extractLeadPreferences({
      intent: "kauf",
      budget: "500.000 €",
      property_type: "3-Zimmer-Wohnung",
      object_desc: null,
      location: "München",
    });
    expect(prefs.applicable).toBe(true);
    expect(prefs.transactionType).toBe("kauf");
    expect(prefs.maxBudget).toBe(500_000);
    expect(prefs.propertyType).toBe("wohnung");
    expect(prefs.minRooms).toBe(3);
    expect(prefs.locationText).toBe("München");
  });

  it("is applicable for miete with transactionType 'miete'", () => {
    const prefs = extractLeadPreferences({
      intent: "miete",
      budget: "550 Euro Kaltmiete",
      property_type: null,
      object_desc: null,
      location: null,
    });
    expect(prefs.applicable).toBe(true);
    expect(prefs.transactionType).toBe("miete");
    expect(prefs.maxBudget).toBe(550);
    expect(prefs.locationText).toBe(UNKNOWN);
  });

  it("leaves every criterion unknown when the underlying lead fields are empty", () => {
    const prefs = extractLeadPreferences({
      intent: "kauf",
      budget: null,
      property_type: null,
      object_desc: null,
      location: null,
    });
    expect(prefs.maxBudget).toBe(UNKNOWN);
    expect(prefs.propertyType).toBe(UNKNOWN);
    expect(prefs.minRooms).toBe(UNKNOWN);
    expect(prefs.locationText).toBe(UNKNOWN);
  });
});

describe("countKnownPreferenceCriteria", () => {
  it("counts only the non-transactionType criteria that are known", () => {
    const allUnknown = extractLeadPreferences({
      intent: "kauf",
      budget: null,
      property_type: null,
      object_desc: null,
      location: null,
    });
    expect(countKnownPreferenceCriteria(allUnknown)).toBe(0);

    const oneKnown = extractLeadPreferences({
      intent: "kauf",
      budget: "500.000 €",
      property_type: null,
      object_desc: null,
      location: null,
    });
    expect(countKnownPreferenceCriteria(oneKnown)).toBe(1);

    const allKnown = extractLeadPreferences({
      intent: "kauf",
      budget: "500.000 €",
      property_type: "3-Zimmer-Wohnung",
      object_desc: null,
      location: "Berlin",
    });
    // budget, location, propertyType, AND minRooms (parsed from the same
    // "3-Zimmer-Wohnung" string) are all known here -> 4, not 3.
    expect(countKnownPreferenceCriteria(allKnown)).toBe(4);
  });
});
