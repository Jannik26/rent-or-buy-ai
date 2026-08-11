// Real-DB integration test for the Property Domain Model + Property
// Matching V1 (Product Track slice 9, see ROADMAP.md) — exercises
// createProperty/updateProperty's actual SQL behavior and the matching
// pipeline (extractLeadPreferences + rankPropertiesForLead) against the
// real, connected Supabase project, using clearly-tagged, self-cleaning
// fixture data. Never touches any real customer/lead/company data.
//
// Skipped entirely (not failed) when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// aren't present — same convention as every other *.integration.test.ts in
// this repo (see followups.integration.test.ts's header for the full
// rationale). Run with:
//   node --env-file-if-exists=.env node_modules/.bin/vitest run src/lib/properties/properties.integration.test.ts
//
// Uses the service-role admin client directly (bypasses RLS) — tenant
// isolation itself is already exhaustively verified against real
// impersonated JWTs in supabase/tests/properties_rls.sql (16/16
// assertions, run and recorded in this session's report), so this file
// focuses on the behavior RLS tests can't: does createProperty/
// updateProperty's actual column mapping round-trip correctly, and does
// the matching pipeline produce the right outcome against real rows.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildPropertyInsertPayload, buildPropertyUpdatePayload } from "./property-rules";
import { extractLeadPreferences } from "@/lib/matching/lead-preferences";
import { rankPropertiesForLead } from "@/lib/matching/matching-rules";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Same dedicated QA/E2E tenant every other integration test in this repo
// uses (tests/e2e/fixtures-data.ts, followups.integration.test.ts, …) —
// never a real customer's company.
const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";

// Fresh, unused fixture-id prefix for this slice (checked against every
// other *.test.ts fixture prefix in the repo before picking it).
const FIXTURE = {
  leadBuyer: "f0900001-0000-0000-0000-000000000001",
  leadSeller: "f0900001-0000-0000-0000-000000000002",
  leadInsufficient: "f0900001-0000-0000-0000-000000000003",
  propertyA: "f0900002-0000-0000-0000-000000000001",
  propertyB: "f0900002-0000-0000-0000-000000000002",
  propertyDraft: "f0900002-0000-0000-0000-000000000003",
};

describe.skipIf(!hasCredentials)("Property Domain Model + Matching (real DB)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  });

  afterEach(async () => {
    await admin
      .from("properties")
      .delete()
      .in("id", [FIXTURE.propertyA, FIXTURE.propertyB, FIXTURE.propertyDraft]);
    await admin
      .from("leads")
      .delete()
      .in("id", [FIXTURE.leadBuyer, FIXTURE.leadSeller, FIXTURE.leadInsufficient]);
  });

  afterAll(async () => {
    // Belt and braces, matching the established convention in this repo's
    // other integration tests — the per-test afterEach already cleans up,
    // this is a final safety net in case a test failed mid-way.
    await admin
      .from("properties")
      .delete()
      .in("id", [FIXTURE.propertyA, FIXTURE.propertyB, FIXTURE.propertyDraft]);
    await admin
      .from("leads")
      .delete()
      .in("id", [FIXTURE.leadBuyer, FIXTURE.leadSeller, FIXTURE.leadInsufficient]);
  });

  it("Property anlegen: createProperty's payload round-trips through the real properties table", async () => {
    const payload = buildPropertyInsertPayload({
      title: "Integrationstest Objekt A",
      status: "active",
      marketingType: "kauf",
      price: 450_000,
      propertyType: "wohnung",
      street: "Musterstraße",
      houseNumber: "1",
      postalCode: "20095",
      city: "Hamburg",
      district: null,
      country: "DE",
      livingAreaM2: 90,
      plotAreaM2: null,
      rooms: 3.5,
      bedrooms: 2,
      bathrooms: 1,
      floor: "2. OG",
      hasBalcony: true,
      hasTerrace: false,
      hasGarden: false,
      hasParking: false,
      hasElevator: false,
      hasFittedKitchen: false,
      isAccessible: false,
      description: null,
      externalReference: null,
    });
    const { data: created, error } = await admin
      .from("properties")
      .insert({ ...payload, id: FIXTURE.propertyA, company_id: QA_COMPANY_ID })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(created?.title).toBe("Integrationstest Objekt A");
    expect(created?.rooms).toBe(3.5);
    expect(created?.has_balcony).toBe(true);
    expect(created?.status).toBe("active");
  });

  it("Property editieren: a partial update patch only touches the given fields", async () => {
    const insertPayload = buildPropertyInsertPayload({
      title: "Vor dem Edit",
      status: "draft",
      marketingType: "miete",
      price: 900,
      propertyType: "wohnung",
      street: null,
      houseNumber: null,
      postalCode: "10115",
      city: "Berlin",
      district: null,
      country: "DE",
      livingAreaM2: 60,
      plotAreaM2: null,
      rooms: 2,
      bedrooms: null,
      bathrooms: null,
      floor: null,
      hasBalcony: false,
      hasTerrace: false,
      hasGarden: false,
      hasParking: false,
      hasElevator: false,
      hasFittedKitchen: false,
      isAccessible: false,
      description: null,
      externalReference: null,
    });
    await admin
      .from("properties")
      .insert({ ...insertPayload, id: FIXTURE.propertyB, company_id: QA_COMPANY_ID });

    const patch = buildPropertyUpdatePayload({ status: "active", price: 950 });
    const { data: updated, error } = await admin
      .from("properties")
      .update(patch)
      .eq("id", FIXTURE.propertyB)
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(updated?.status).toBe("active");
    expect(updated?.price).toBe(950);
    // Untouched fields survive the partial update unchanged.
    expect(updated?.title).toBe("Vor dem Edit");
    expect(updated?.city).toBe("Berlin");
  });

  it("Lead Matching: a real buyer lead matches a real active property with explainable reasons", async () => {
    await admin.from("leads").insert({
      id: FIXTURE.leadBuyer,
      company_id: QA_COMPANY_ID,
      name: "Integrationstest Käufer",
      intent: "kauf",
      budget: "500.000 €",
      property_type: "3-Zimmer-Wohnung",
      location: "Hamburg",
    });
    const payload = buildPropertyInsertPayload({
      title: "Integrationstest Matching-Objekt",
      status: "active",
      marketingType: "kauf",
      price: 450_000,
      propertyType: "wohnung",
      street: null,
      houseNumber: null,
      postalCode: "20095",
      city: "Hamburg",
      district: null,
      country: "DE",
      livingAreaM2: 85,
      plotAreaM2: null,
      rooms: 3,
      bedrooms: null,
      bathrooms: null,
      floor: null,
      hasBalcony: false,
      hasTerrace: false,
      hasGarden: false,
      hasParking: false,
      hasElevator: false,
      hasFittedKitchen: false,
      isAccessible: false,
      description: null,
      externalReference: null,
    });
    await admin
      .from("properties")
      .insert({ ...payload, id: FIXTURE.propertyA, company_id: QA_COMPANY_ID });

    const { data: lead } = await admin
      .from("leads")
      .select("id, intent, budget, property_type, object_desc, location")
      .eq("id", FIXTURE.leadBuyer)
      .single();
    const { data: properties } = await admin
      .from("properties")
      .select("*")
      .eq("company_id", QA_COMPANY_ID);

    const prefs = extractLeadPreferences(lead!);
    const result = rankPropertiesForLead(prefs, (properties ?? []) as never);
    expect(result.outcome).toBe("scored");
    if (result.outcome !== "scored") throw new Error("unreachable");
    const match = result.matches.find((m) => m.property.id === FIXTURE.propertyA);
    expect(match).toBeDefined();
    expect(match!.score).toBeGreaterThanOrEqual(80);
    expect(match!.reasons.every((r) => r.symbol === "match")).toBe(true);
  });

  it("zero match: a seller-intent lead (verkauf) yields not_applicable, never a fabricated score", async () => {
    await admin.from("leads").insert({
      id: FIXTURE.leadSeller,
      company_id: QA_COMPANY_ID,
      name: "Integrationstest Verkäufer",
      intent: "verkauf",
    });
    const { data: lead } = await admin
      .from("leads")
      .select("id, intent, budget, property_type, object_desc, location")
      .eq("id", FIXTURE.leadSeller)
      .single();
    const { data: properties } = await admin
      .from("properties")
      .select("*")
      .eq("company_id", QA_COMPANY_ID);

    const prefs = extractLeadPreferences(lead!);
    const result = rankPropertiesForLead(prefs, (properties ?? []) as never);
    expect(result).toEqual({ outcome: "not_applicable" });
  });

  it("insufficient preferences: a buyer lead with no usable fields yields insufficient_criteria, not a guess", async () => {
    await admin.from("leads").insert({
      id: FIXTURE.leadInsufficient,
      company_id: QA_COMPANY_ID,
      name: "Integrationstest Wenig Info",
      intent: "kauf",
    });
    // At least one active property must exist so "insufficient_criteria"
    // is provably distinct from "no_properties" in this assertion.
    const payload = buildPropertyInsertPayload({
      title: "Beliebiges Objekt",
      status: "active",
      marketingType: "kauf",
      price: 300_000,
      propertyType: "haus",
      street: null,
      houseNumber: null,
      postalCode: "80331",
      city: "München",
      district: null,
      country: "DE",
      livingAreaM2: 120,
      plotAreaM2: null,
      rooms: 5,
      bedrooms: null,
      bathrooms: null,
      floor: null,
      hasBalcony: false,
      hasTerrace: false,
      hasGarden: false,
      hasParking: false,
      hasElevator: false,
      hasFittedKitchen: false,
      isAccessible: false,
      description: null,
      externalReference: null,
    });
    await admin
      .from("properties")
      .insert({ ...payload, id: FIXTURE.propertyDraft, company_id: QA_COMPANY_ID });

    const { data: lead } = await admin
      .from("leads")
      .select("id, intent, budget, property_type, object_desc, location")
      .eq("id", FIXTURE.leadInsufficient)
      .single();
    const { data: properties } = await admin
      .from("properties")
      .select("*")
      .eq("company_id", QA_COMPANY_ID);

    const prefs = extractLeadPreferences(lead!);
    const result = rankPropertiesForLead(prefs, (properties ?? []) as never);
    expect(result).toEqual({ outcome: "insufficient_criteria" });
  });
});
