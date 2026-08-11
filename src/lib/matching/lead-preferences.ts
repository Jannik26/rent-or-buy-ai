// Lead Preference Model (Product Track slice 9, "Property Domain Model +
// Property Matching V1" — see ROADMAP.md and docs/platform-modules.md 5.2,
// task Abschnitt 7). The ONE canonical way matching criteria are read from
// a lead — no second, competing representation is ever persisted. Pure,
// no Supabase I/O.
//
// Real-data investigation against the connected project (before writing
// this file, not assumed) found leads.property_type/location/budget
// populated for a minority of leads (11/23, 10/23, 4/23) and — critically —
// in inconsistent formats: budget alone included "4.500.000 €", "400000",
// "500.000 €", and "550 Euro Kaltmiete" (a monthly rent figure, not a
// purchase budget, in the very same free-text column). Per task
// instructions ("keine aggressive automatische Migration unsicherer
// Freitextdaten... wenn nicht zuverlässig interpretierbar: nicht
// erfinden"), this module only extracts a criterion when it can do so via
// a narrow, syntactic, conservative parse — never a semantic guess. Every
// other criterion is `"unknown"`, explicitly, never silently treated as a
// match or a mismatch (see matching-rules.ts).
//
// Feature preferences (balcony/garden/parking/…) are NOT extracted at all
// in this V1: no lead field reliably carries them today (object_desc is
// free text, populated on only 3/23 leads, with no controlled vocabulary)
// — inventing a keyword-matcher against that would be exactly the kind of
// unreliable inference this task explicitly warns against. Always
// "unknown" until a future slice captures search criteria in a
// structured way (e.g. an explicit qualification step in the widget).
import type { LeadIntent } from "@/lib/lead-summary-schema";
import type { PropertyMarketingType, PropertyTypeValue } from "@/lib/properties/property-rules";
import { PROPERTY_TYPES } from "@/lib/properties/property-rules";

export type Unknown = "unknown";
export const UNKNOWN: Unknown = "unknown";

export type LeadPreferences = {
  /** false for lead intents that aren't "looking for a property to move
   * into" at all (verkauf/bewertung/sonstiges/unbekannt) — Property
   * Matching is not applicable to those leads, full stop (see
   * matching-rules.ts's NOT_APPLICABLE outcome). */
  applicable: boolean;
  transactionType: PropertyMarketingType | Unknown;
  /** The parsed maximum amount the lead is willing to spend (purchase
   * price for `kauf`, monthly rent for `miete`) — a hard constraint when
   * known (see matching-rules.ts), never a preference. */
  maxBudget: number | Unknown;
  /** Raw, unstructured — leads.location is never reliably splittable into
   * street/postal_code/city (see module doc), so this stays a free-text
   * string compared via normalized substring matching against a
   * property's city/postal_code/district, not a structured field. */
  locationText: string | Unknown;
  propertyType: PropertyTypeValue | Unknown;
  minRooms: number | Unknown;
};

/** Only these two intents represent a lead actually searching for a
 * property to move into. `verkauf`/`bewertung` leads are sellers — showing
 * them "matching properties" would be a category error (there's nothing
 * to match), not just a missing feature; `sonstiges`/`unbekannt` carry no
 * determinable transaction type at all. */
function transactionTypeFromIntent(intent: LeadIntent): {
  applicable: boolean;
  transactionType: PropertyMarketingType | Unknown;
} {
  if (intent === "kauf") return { applicable: true, transactionType: "kauf" };
  if (intent === "miete") return { applicable: true, transactionType: "miete" };
  return { applicable: false, transactionType: UNKNOWN };
}

/** Conservative German-locale numeric parse: strips currency words/symbols
 * and whitespace, then accepts only a string that — after stripping — is
 * purely digits with optional "." as a thousands separator and "," as a
 * decimal separator (the real formats observed: "4.500.000 €", "400000",
 * "500.000 €"). Anything else (a range, "VB", "Kaltmiete" left attached to
 * digits in an ambiguous way, non-numeric text) returns "unknown" rather
 * than guessing — a wrong parsed number actively misleads a hard-constraint
 * budget check, which is worse than not having one at all. */
export function parseBudgetToNumber(raw: string | null | undefined): number | Unknown {
  if (!raw) return UNKNOWN;
  const trimmed = raw.trim();
  if (!trimmed) return UNKNOWN;
  // Strip known currency words/symbols and surrounding whitespace only —
  // never strip digits or separators.
  const stripped = trimmed
    .replace(/€/g, "")
    .replace(/\beuro\b/gi, "")
    .replace(/\bkaltmiete\b/gi, "")
    .replace(/\bwarmmiete\b/gi, "")
    .trim();
  if (!stripped) return UNKNOWN;
  // German-locale number: groups of 3 digits separated by ".", optional
  // ",dd" decimal. Also accept a bare integer with no separators at all
  // (e.g. "400000").
  const germanLocale = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$/;
  const bareInteger = /^\d+$/;
  if (bareInteger.test(stripped)) {
    return Number(stripped);
  }
  if (germanLocale.test(stripped)) {
    const numeric = stripped.replace(/\./g, "").replace(",", ".");
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : UNKNOWN;
  }
  return UNKNOWN;
}

/** Keyword match against the same small controlled vocabulary
 * `properties.property_type` uses — syntactic (literal substring, not
 * semantic guessing), so "3-Zimmer-Wohnung" -> "wohnung",
 * "Haus (4 Zimmer)" -> "haus", "Grundstück" -> "grundstueck". No match
 * (e.g. a value entirely outside this vocabulary) -> "unknown", never a
 * fabricated category. */
export function parsePropertyType(raw: string | null | undefined): PropertyTypeValue | Unknown {
  if (!raw) return UNKNOWN;
  const lower = raw.toLowerCase();
  const KEYWORDS: Array<[PropertyTypeValue, string[]]> = [
    ["wohnung", ["wohnung", "apartment", "eigentumswohnung"]],
    ["haus", ["haus", "villa", "einfamilienhaus", "doppelhaus", "reihenhaus"]],
    ["grundstueck", ["grundstück", "grundstueck", "baugrundstück", "baugrundstueck"]],
    ["gewerbe", ["gewerbe", "büro", "buero", "laden", "praxis"]],
  ];
  for (const [value, keywords] of KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return value;
  }
  return UNKNOWN;
}

/** Extracts a room count from an explicit "<n> Zimmer"/"<n>-Zimmer" pattern
 * — purely syntactic extraction of a number tied to the literal word
 * "Zimmer" (not semantic guessing), so it stays inside the "reliable
 * parse" bar this module holds itself to. Supports the German half-room
 * convention ("3,5 Zimmer"). No match -> "unknown". */
export function parseMinRooms(...sources: Array<string | null | undefined>): number | Unknown {
  const pattern = /(\d+(?:[.,]\d)?)\s*-?\s*zimmer/i;
  for (const raw of sources) {
    if (!raw) continue;
    const match = pattern.exec(raw);
    if (match) {
      const parsed = Number(match[1].replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return UNKNOWN;
}

function normalizedLocationText(raw: string | null | undefined): string | Unknown {
  if (!raw) return UNKNOWN;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN;
}

/** THE canonical read path for a lead's matching criteria — every caller
 * (the matching engine, any future UI that needs to show "what we know
 * about this lead's search") goes through this function, never re-reads
 * leads.budget/property_type/location ad hoc. */
export function extractLeadPreferences(lead: {
  intent: LeadIntent;
  budget: string | null;
  property_type: string | null;
  object_desc: string | null;
  location: string | null;
}): LeadPreferences {
  const { applicable, transactionType } = transactionTypeFromIntent(lead.intent);
  if (!applicable) {
    return {
      applicable: false,
      transactionType: UNKNOWN,
      maxBudget: UNKNOWN,
      locationText: UNKNOWN,
      propertyType: UNKNOWN,
      minRooms: UNKNOWN,
    };
  }
  return {
    applicable: true,
    transactionType,
    maxBudget: parseBudgetToNumber(lead.budget),
    locationText: normalizedLocationText(lead.location),
    propertyType: parsePropertyType(lead.property_type),
    minRooms: parseMinRooms(lead.property_type, lead.object_desc),
  };
}

/** How many of the (non-transactionType) criteria are actually known —
 * used by matching-rules.ts to decide the "insufficient criteria" empty
 * state (task Abschnitt 12): a lead where only the transaction type is
 * known has nothing else to score a match against. */
export function countKnownPreferenceCriteria(prefs: LeadPreferences): number {
  let count = 0;
  if (prefs.maxBudget !== UNKNOWN) count++;
  if (prefs.locationText !== UNKNOWN) count++;
  if (prefs.propertyType !== UNKNOWN) count++;
  if (prefs.minRooms !== UNKNOWN) count++;
  return count;
}

// Re-exported so callers (matching-rules.ts, tests) don't need a second
// import just for the vocabulary constant.
export { PROPERTY_TYPES };
