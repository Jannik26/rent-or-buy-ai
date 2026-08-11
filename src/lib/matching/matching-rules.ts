// Property Matching Engine V1 (Product Track slice 9 — see ROADMAP.md and
// docs/platform-modules.md 5.2, task Abschnitt 8-10). Pure, deterministic,
// explainable — NO LLM call anywhere in this file, no hidden AI score.
// Every returned score is reconstructable from the individual criterion
// reasons returned alongside it (task Abschnitt 10/15).
import type { PropertyRow } from "@/lib/properties/properties.functions";
import {
  countKnownPreferenceCriteria,
  type LeadPreferences,
  UNKNOWN,
} from "@/lib/matching/lead-preferences";

/** Only properties actually on the market are matchable — a draft listing
 * isn't ready to show a lead, and a sold/rented/archived one is no longer
 * available. 'reserved' is deliberately excluded too: showing a lead a
 * property someone else is already about to close on is a worse outcome
 * than not showing it. Exported so the server-function layer (and tests)
 * share one definition instead of two. */
export const MATCHABLE_PROPERTY_STATUSES = ["active"] as const;

export type MatchSymbol = "match" | "partial" | "mismatch";

export type MatchReason = {
  criterion: "transactionType" | "budget" | "location" | "propertyType" | "rooms";
  symbol: MatchSymbol;
  /** Short, human-readable German explanation — exactly what the Lead
   * Detail UI renders next to the symbol (task Abschnitt 11 example:
   * "✓ Budget max. 450.000 € → 429.000 €"). */
  label: string;
};

export type PropertyMatch = {
  property: PropertyRow;
  score: number;
  reasons: MatchReason[];
};

export type MatchLeadToPropertiesResult =
  | { outcome: "not_applicable" }
  | { outcome: "insufficient_criteria" }
  | { outcome: "no_properties" }
  | { outcome: "scored"; matches: PropertyMatch[] };

// ---- Weights (task Abschnitt 10: "einfacher transparenter V1-Score",
// reconstructable from individual criteria, not pseudo-scientific
// precision) — five criteria, evenly weighted at 20 points each. A
// criterion unknown on either side is excluded from both the numerator
// and the denominator (renormalized), never silently scored as 0. ----
const CRITERION_WEIGHT = 20;

/** A property below this score is not shown in the primary "passende
 * Immobilien" list (task Abschnitt 12: "keine ausreichend passenden
 * Immobilien" rather than a misleadingly low percentage) — still
 * available to the caller as a separate, explicitly weaker candidate
 * list if the UI chooses to surface it. */
export const MIN_DISPLAY_SCORE = 40;

/** A lead is "insufficient criteria" when nothing beyond the transaction
 * type itself is known — there's nothing left for the engine to score a
 * property against (task Abschnitt 12: never fabricate a percentage from
 * near-zero information). */
const MIN_KNOWN_CRITERIA_FOR_SCORING = 1;

function evaluateTransactionType(
  prefs: LeadPreferences,
  property: PropertyRow,
): MatchReason | "excluded" {
  // prefs.transactionType is always known here (guarded by `applicable`
  // one level up) — this criterion is a hard constraint: a buyer lead
  // shown a rental property (or vice versa) is a categorical mismatch,
  // not a partial one.
  if (prefs.transactionType !== property.marketing_type) return "excluded";
  const label =
    property.marketing_type === "kauf"
      ? "Kaufobjekt gesucht → Kaufobjekt"
      : "Mietobjekt gesucht → Mietobjekt";
  return { criterion: "transactionType", symbol: "match", label };
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value) + " €";
}

/** Hard constraint (task Abschnitt 9: "zwingendes maximales Budget, falls
 * als zwingend bekannt") — a parsed lead budget is treated as a firm
 * maximum: showing a property well above what a lead stated they can
 * spend is a worse experience than being conservative (documented product
 * decision, not an accident). Property price itself unknown -> the
 * criterion is simply skipped (excluded from scoring), never assumed to
 * pass or fail. */
function evaluateBudget(
  prefs: LeadPreferences,
  property: PropertyRow,
): MatchReason | "excluded" | "unknown" {
  if (prefs.maxBudget === UNKNOWN) return "unknown";
  if (property.price == null) return "unknown";
  if (property.price > prefs.maxBudget) return "excluded";
  return {
    criterion: "budget",
    symbol: "match",
    label: `Budget max. ${formatEuro(prefs.maxBudget)} → ${formatEuro(property.price)}`,
  };
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase();
}

/** Soft preference — a loose, case-insensitive substring check in both
 * directions against city/postal_code/district, since leads.location is
 * uncontrolled free text (see lead-preferences.ts) that can never be
 * reliably split into structured parts. Not a hard constraint (task
 * Abschnitt 9: "Nicht pauschal annehmen, dass ein Wunsch zwingend ist") —
 * a lead open to "München" might still be worth showing a strong match a
 * few km outside it. */
function evaluateLocation(prefs: LeadPreferences, property: PropertyRow): MatchReason | "unknown" {
  if (prefs.locationText === UNKNOWN) return "unknown";
  const wanted = normalizeForComparison(prefs.locationText);
  const candidates = [property.city, property.postal_code, property.district ?? ""].map(
    normalizeForComparison,
  );
  const isMatch = candidates.some(
    (c) => c.length > 0 && (wanted.includes(c) || c.includes(wanted)),
  );
  return isMatch
    ? {
        criterion: "location",
        symbol: "match",
        label: `${prefs.locationText} gesucht → ${property.city}`,
      }
    : {
        criterion: "location",
        symbol: "mismatch",
        label: `${prefs.locationText} gesucht → ${property.city}`,
      };
}

function evaluatePropertyType(
  prefs: LeadPreferences,
  property: PropertyRow,
): MatchReason | "unknown" {
  if (prefs.propertyType === UNKNOWN) return "unknown";
  const isMatch = prefs.propertyType === property.property_type;
  return {
    criterion: "propertyType",
    symbol: isMatch ? "match" : "mismatch",
    label: isMatch
      ? `${labelForPropertyType(property.property_type)} gesucht → ${labelForPropertyType(property.property_type)}`
      : `${labelForPropertyType(prefs.propertyType)} gesucht → ${labelForPropertyType(property.property_type)}`,
  };
}

function labelForPropertyType(value: string): string {
  const LABELS: Record<string, string> = {
    wohnung: "Wohnung",
    haus: "Haus",
    grundstueck: "Grundstück",
    gewerbe: "Gewerbe",
    sonstiges: "Sonstiges",
  };
  return LABELS[value] ?? value;
}

/** Soft preference, partial credit allowed — "mindestens N Zimmer gesucht"
 * is satisfied fully by >= N, partially by a property just short of N
 * (task example: "mindestens 4 Zimmer gesucht → Objekt hat 3,5"), and
 * treated as a mismatch only when meaningfully short. */
function evaluateRooms(prefs: LeadPreferences, property: PropertyRow): MatchReason | "unknown" {
  if (prefs.minRooms === UNKNOWN) return "unknown";
  if (property.rooms == null) return "unknown";
  const diff = property.rooms - prefs.minRooms;
  const label = `mindestens ${formatRooms(prefs.minRooms)} Zimmer gesucht → Objekt hat ${formatRooms(property.rooms)}`;
  if (diff >= 0) return { criterion: "rooms", symbol: "match", label };
  if (diff >= -1) return { criterion: "rooms", symbol: "partial", label };
  return { criterion: "rooms", symbol: "mismatch", label };
}

function formatRooms(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

const SYMBOL_WEIGHT: Record<MatchSymbol, number> = { match: 1, partial: 0.5, mismatch: 0 };

/**
 * Evaluates one property against one lead's preferences. Returns null when
 * a hard constraint (transaction type or budget) disqualifies the
 * property outright — the caller filters those out of the ranked list
 * entirely (task Abschnitt 9: "kann einen Match disqualifizieren").
 */
export function matchLeadToProperty(
  prefs: LeadPreferences,
  property: PropertyRow,
): PropertyMatch | null {
  const transactionTypeResult = evaluateTransactionType(prefs, property);
  if (transactionTypeResult === "excluded") return null;

  const budgetResult = evaluateBudget(prefs, property);
  if (budgetResult === "excluded") return null;

  const softResults = [
    evaluateLocation(prefs, property),
    evaluatePropertyType(prefs, property),
    evaluateRooms(prefs, property),
  ];

  const reasons: MatchReason[] = [transactionTypeResult];
  if (budgetResult !== "unknown") reasons.push(budgetResult);
  for (const r of softResults) {
    if (r !== "unknown") reasons.push(r);
  }

  // Score: transactionType always contributes (it's always known/passed at
  // this point); every other reason present contributes its weight *
  // symbol-weight; anything "unknown" is excluded from both sides of the
  // ratio, never scored as 0 (task Abschnitt 10).
  const earned = reasons.reduce((sum, r) => sum + CRITERION_WEIGHT * SYMBOL_WEIGHT[r.symbol], 0);
  const possible = reasons.length * CRITERION_WEIGHT;
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  return { property, score, reasons };
}

/**
 * Ranks every matchable property in `properties` against one lead's
 * preferences. Deterministic sort: score desc, then updated_at desc (most
 * recently touched listing first among ties), then id asc (final,
 * unconditional tie-break so the order is always fully reproducible, task
 * Abschnitt 10).
 */
export function rankPropertiesForLead(
  prefs: LeadPreferences,
  properties: PropertyRow[],
): MatchLeadToPropertiesResult {
  if (!prefs.applicable) return { outcome: "not_applicable" };

  const matchable = properties.filter((p) =>
    (MATCHABLE_PROPERTY_STATUSES as readonly string[]).includes(p.status),
  );
  if (matchable.length === 0) return { outcome: "no_properties" };

  if (countKnownPreferenceCriteria(prefs) < MIN_KNOWN_CRITERIA_FOR_SCORING) {
    return { outcome: "insufficient_criteria" };
  }

  const matches = matchable
    .map((p) => matchLeadToProperty(prefs, p))
    .filter((m): m is PropertyMatch => m !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bUpdated = new Date(b.property.updated_at).getTime();
      const aUpdated = new Date(a.property.updated_at).getTime();
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      return a.property.id < b.property.id ? -1 : a.property.id > b.property.id ? 1 : 0;
    });

  return { outcome: "scored", matches };
}
