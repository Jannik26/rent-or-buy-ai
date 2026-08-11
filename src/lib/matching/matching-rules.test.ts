import { describe, expect, it } from "vitest";
import {
  MIN_DISPLAY_SCORE,
  matchLeadToProperty,
  rankPropertiesForLead,
} from "@/lib/matching/matching-rules";
import {
  extractLeadPreferences,
  UNKNOWN,
  type LeadPreferences,
} from "@/lib/matching/lead-preferences";
import type { PropertyRow } from "@/lib/properties/properties.functions";

let idCounter = 0;
function property(overrides: Partial<PropertyRow> = {}): PropertyRow {
  idCounter += 1;
  const now = new Date(2026, 0, 1, 12, 0, 0).toISOString();
  return {
    id: `00000000-0000-0000-0000-${String(idCounter).padStart(12, "0")}`,
    company_id: "11111111-1111-1111-1111-111111111111",
    title: "Test Objekt",
    status: "active",
    marketing_type: "kauf",
    price: 450_000,
    currency: "EUR",
    property_type: "wohnung",
    street: "Musterstraße",
    house_number: "1",
    postal_code: "20095",
    city: "Hamburg",
    district: null,
    country: "DE",
    living_area_m2: 90,
    plot_area_m2: null,
    rooms: 4,
    bedrooms: 2,
    bathrooms: 1,
    floor: "2. OG",
    has_balcony: true,
    has_terrace: false,
    has_garden: false,
    has_parking: false,
    has_elevator: false,
    has_fitted_kitchen: false,
    is_accessible: false,
    description: null,
    external_reference: null,
    created_by: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function preferences(overrides: Partial<LeadPreferences> = {}): LeadPreferences {
  return {
    applicable: true,
    transactionType: "kauf",
    maxBudget: 450_000,
    locationText: "Hamburg",
    propertyType: "wohnung",
    minRooms: 4,
    ...overrides,
  };
}

describe("matchLeadToProperty", () => {
  it("perfect match: every known criterion matches, score 100", () => {
    const result = matchLeadToProperty(preferences(), property());
    expect(result).not.toBeNull();
    expect(result?.score).toBe(100);
    expect(result?.reasons.every((r) => r.symbol === "match")).toBe(true);
    expect(result?.reasons.map((r) => r.criterion).sort()).toEqual(
      ["budget", "location", "propertyType", "rooms", "transactionType"].sort(),
    );
  });

  it("hard constraint: kauf lead vs. miete property is excluded (null), not merely low-scored", () => {
    const result = matchLeadToProperty(
      preferences({ transactionType: "kauf" }),
      property({ marketing_type: "miete" }),
    );
    expect(result).toBeNull();
  });

  it("hard constraint: miete lead vs. kauf property is excluded", () => {
    const result = matchLeadToProperty(
      preferences({ transactionType: "miete" }),
      property({ marketing_type: "kauf" }),
    );
    expect(result).toBeNull();
  });

  it("budget within range: scored as a match reason", () => {
    const result = matchLeadToProperty(
      preferences({ maxBudget: 450_000 }),
      property({ price: 429_000 }),
    );
    expect(result).not.toBeNull();
    const budgetReason = result?.reasons.find((r) => r.criterion === "budget");
    expect(budgetReason?.symbol).toBe("match");
    expect(budgetReason?.label).toContain("429.000");
  });

  it("budget outside range (hard constraint): property excluded entirely", () => {
    const result = matchLeadToProperty(
      preferences({ maxBudget: 300_000 }),
      property({ price: 450_000 }),
    );
    expect(result).toBeNull();
  });

  it("missing budget on the lead side: criterion excluded from reasons/score, never assumed a match or mismatch", () => {
    const result = matchLeadToProperty(
      preferences({ maxBudget: UNKNOWN }),
      property({ price: 450_000 }),
    );
    expect(result).not.toBeNull();
    expect(result?.reasons.some((r) => r.criterion === "budget")).toBe(false);
    // 4 remaining criteria (transactionType, location, propertyType, rooms) all match -> still 100.
    expect(result?.score).toBe(100);
  });

  it("missing price on the property side: criterion excluded from reasons/score", () => {
    const result = matchLeadToProperty(
      preferences({ maxBudget: 450_000 }),
      property({ price: null }),
    );
    expect(result).not.toBeNull();
    expect(result?.reasons.some((r) => r.criterion === "budget")).toBe(false);
  });

  it("rooms exact match", () => {
    const result = matchLeadToProperty(preferences({ minRooms: 4 }), property({ rooms: 4 }));
    const reason = result?.reasons.find((r) => r.criterion === "rooms");
    expect(reason?.symbol).toBe("match");
  });

  it("rooms partial match (just short, task example: wanted 4, has 3.5)", () => {
    const result = matchLeadToProperty(preferences({ minRooms: 4 }), property({ rooms: 3.5 }));
    const reason = result?.reasons.find((r) => r.criterion === "rooms");
    expect(reason?.symbol).toBe("partial");
    expect(reason?.label).toContain("3,5");
  });

  it("rooms clear mismatch (meaningfully short)", () => {
    const result = matchLeadToProperty(preferences({ minRooms: 5 }), property({ rooms: 2 }));
    const reason = result?.reasons.find((r) => r.criterion === "rooms");
    expect(reason?.symbol).toBe("mismatch");
  });

  it("rooms exceeding the requirement is still a full match", () => {
    const result = matchLeadToProperty(preferences({ minRooms: 3 }), property({ rooms: 5 }));
    const reason = result?.reasons.find((r) => r.criterion === "rooms");
    expect(reason?.symbol).toBe("match");
  });

  it("location match via city substring", () => {
    const result = matchLeadToProperty(
      preferences({ locationText: "Hamburg" }),
      property({ city: "Hamburg", postal_code: "20095" }),
    );
    const reason = result?.reasons.find((r) => r.criterion === "location");
    expect(reason?.symbol).toBe("match");
  });

  it("location match via postal code substring", () => {
    const result = matchLeadToProperty(
      preferences({ locationText: "22111 Heide" }),
      property({ city: "Heide", postal_code: "22111" }),
    );
    const reason = result?.reasons.find((r) => r.criterion === "location");
    expect(reason?.symbol).toBe("match");
  });

  it("location mismatch: different city, soft (not excluded)", () => {
    const result = matchLeadToProperty(
      preferences({ locationText: "Köln" }),
      property({ city: "München", postal_code: "80331" }),
    );
    expect(result).not.toBeNull();
    const reason = result?.reasons.find((r) => r.criterion === "location");
    expect(reason?.symbol).toBe("mismatch");
  });

  it("propertyType mismatch is soft, not excluded", () => {
    const result = matchLeadToProperty(
      preferences({ propertyType: "wohnung" }),
      property({ property_type: "haus" }),
    );
    expect(result).not.toBeNull();
    const reason = result?.reasons.find((r) => r.criterion === "propertyType");
    expect(reason?.symbol).toBe("mismatch");
  });

  it("unknown criteria on both sides never appear in reasons at all", () => {
    const result = matchLeadToProperty(
      preferences({
        locationText: UNKNOWN,
        propertyType: UNKNOWN,
        minRooms: UNKNOWN,
        maxBudget: UNKNOWN,
      }),
      property(),
    );
    expect(result).not.toBeNull();
    expect(result?.reasons).toEqual([
      { criterion: "transactionType", symbol: "match", label: expect.any(String) },
    ]);
    // Only one decidable criterion (transactionType) -> full score.
    expect(result?.score).toBe(100);
  });

  it("score normalization: with 2 of 5 criteria known and both matching, score is still 100 (not diluted)", () => {
    const result = matchLeadToProperty(
      preferences({ locationText: UNKNOWN, propertyType: UNKNOWN, minRooms: UNKNOWN }),
      property({ price: 400_000 }),
    );
    expect(result?.reasons).toHaveLength(2); // transactionType + budget
    expect(result?.score).toBe(100);
  });

  it("score normalization: a single soft mismatch among several matches drags the score down proportionally, not to zero", () => {
    const result = matchLeadToProperty(
      preferences(),
      property({ city: "Berlin", postal_code: "10115" }),
    );
    // 4/5 criteria match, 1 (location) mismatches -> 80%.
    expect(result?.score).toBe(80);
  });

  it("feature preferences (balcony/garden/…) are not part of V1 matching — never appear as a reason", () => {
    const result = matchLeadToProperty(preferences(), property({ has_balcony: false }));
    expect(result?.reasons.some((r) => (r.criterion as string).includes("balcony"))).toBe(false);
    // Confirms the deliberate V1 scope cut documented in lead-preferences.ts:
    // no lead-side signal for features exists today, so none is fabricated.
  });
});

describe("rankPropertiesForLead", () => {
  it("not_applicable for a seller-side lead", () => {
    const prefs = extractLeadPreferences({
      intent: "verkauf",
      budget: null,
      property_type: null,
      object_desc: null,
      location: null,
    });
    expect(rankPropertiesForLead(prefs, [property()])).toEqual({ outcome: "not_applicable" });
  });

  it("no_properties when there are none matchable (e.g. only archived/draft)", () => {
    const result = rankPropertiesForLead(preferences(), [
      property({ status: "draft" }),
      property({ status: "archived" }),
      property({ status: "sold" }),
    ]);
    expect(result).toEqual({ outcome: "no_properties" });
  });

  it("insufficient_criteria when the lead has nothing beyond the transaction type", () => {
    const prefs = extractLeadPreferences({
      intent: "kauf",
      budget: null,
      property_type: null,
      object_desc: null,
      location: null,
    });
    const result = rankPropertiesForLead(prefs, [property()]);
    expect(result).toEqual({ outcome: "insufficient_criteria" });
  });

  it("scores and sorts by score descending", () => {
    const strong = property({
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      city: "Hamburg",
      postal_code: "20095",
    });
    const weak = property({
      id: "aaaaaaaa-0000-0000-0000-000000000002",
      city: "Berlin",
      postal_code: "10115",
      rooms: 2,
    });
    const result = rankPropertiesForLead(preferences(), [weak, strong]);
    expect(result.outcome).toBe("scored");
    if (result.outcome !== "scored") throw new Error("unreachable");
    expect(result.matches[0].property.id).toBe(strong.id);
    expect(result.matches[0].score).toBeGreaterThan(result.matches[1].score);
  });

  it("deterministic sort: equal scores tie-break by updated_at desc, then id asc", () => {
    const older = property({
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      updated_at: new Date(2026, 0, 1).toISOString(),
    });
    const newer = property({
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      updated_at: new Date(2026, 0, 2).toISOString(),
    });
    const result = rankPropertiesForLead(preferences(), [older, newer]);
    if (result.outcome !== "scored") throw new Error("unreachable");
    expect(result.matches[0].score).toBe(result.matches[1].score);
    expect(result.matches[0].property.id).toBe(newer.id);

    // Same updated_at too -> falls back to id asc, run twice with reversed
    // input order to prove the result doesn't depend on array order.
    const sameTime = new Date(2026, 0, 1).toISOString();
    const idLow = property({ id: "cccccccc-0000-0000-0000-000000000001", updated_at: sameTime });
    const idHigh = property({ id: "cccccccc-0000-0000-0000-000000000002", updated_at: sameTime });
    const resultA = rankPropertiesForLead(preferences(), [idHigh, idLow]);
    const resultB = rankPropertiesForLead(preferences(), [idLow, idHigh]);
    if (resultA.outcome !== "scored" || resultB.outcome !== "scored")
      throw new Error("unreachable");
    expect(resultA.matches[0].property.id).toBe(idLow.id);
    expect(resultB.matches[0].property.id).toBe(idLow.id);
  });

  it("excludes hard-constraint-disqualified properties from the ranked list entirely", () => {
    const wrongType = property({ marketing_type: "miete" });
    const overBudget = property({ price: 10_000_000 });
    const ok = property({});
    const result = rankPropertiesForLead(preferences(), [wrongType, overBudget, ok]);
    if (result.outcome !== "scored") throw new Error("unreachable");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].property.id).toBe(ok.id);
  });

  it("weaker candidates below MIN_DISPLAY_SCORE are still returned (caller decides display), constant is exported for the UI to filter", () => {
    // Only transactionType matches; budget unknown (excluded from the
    // ratio) and location/propertyType/rooms all mismatch -> 20/80 = 25%.
    const weak = property({
      city: "Berlin",
      postal_code: "10115",
      rooms: 1,
      property_type: "haus",
    });
    const result = rankPropertiesForLead(preferences({ maxBudget: UNKNOWN }), [weak]);
    if (result.outcome !== "scored") throw new Error("unreachable");
    expect(result.matches[0].score).toBeLessThan(MIN_DISPLAY_SCORE);
    expect(result.matches[0].score).toBe(25);
  });
});
