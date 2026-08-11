// "Passende Immobilien" section on the Lead Detail page (Product Track
// slice 9, task Abschnitt 11/12). Renders the deterministic, explainable
// output of rankPropertiesForLead — never computes or interprets a score
// itself, purely a presentation layer over matching-rules.ts's output so
// the explainability guarantee (task Abschnitt 15: "kein versteckter
// AI-Score") holds all the way to the screen.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMatchesForLead } from "@/lib/matching/matching.functions";
import {
  MIN_DISPLAY_SCORE,
  type MatchReason,
  type PropertyMatch,
} from "@/lib/matching/matching-rules";

function formatPrice(price: number | null, marketingType: string): string {
  if (price == null) return "—";
  const formatted = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(price);
  return marketingType === "miete" ? `${formatted} € / Monat` : `${formatted} €`;
}

const SYMBOL_GLYPH: Record<MatchReason["symbol"], string> = {
  match: "✓",
  partial: "△",
  mismatch: "✕",
};
const SYMBOL_CLS: Record<MatchReason["symbol"], string> = {
  match: "text-success",
  partial: "text-gold",
  mismatch: "text-destructive",
};

function MatchCard({ match }: { match: PropertyMatch }) {
  return (
    <Link
      to="/properties/$propertyId"
      params={{ propertyId: match.property.id }}
      className="block rounded-xl border border-border bg-card p-4 hover:shadow-elegant transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{match.property.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {match.property.postal_code} {match.property.city} ·{" "}
            {formatPrice(match.property.price, match.property.marketing_type)}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold">
          {match.score} % Match
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {match.reasons.map((r) => (
          <li key={r.criterion} className="text-xs flex items-start gap-1.5">
            <span className={cn("font-semibold shrink-0", SYMBOL_CLS[r.symbol])}>
              {SYMBOL_GLYPH[r.symbol]}
            </span>
            <span className="text-muted-foreground">{r.label}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

export function LeadPropertyMatches({ leadId }: { leadId: string }) {
  const fetchMatches = useServerFn(getMatchesForLead);
  const query = useQuery({
    queryKey: ["lead-property-matches", leadId],
    queryFn: () => fetchMatches({ data: { leadId } }),
  });
  const [showWeak, setShowWeak] = useState(false);

  const result = query.data;
  // Not applicable (a seller/valuation/other lead — Property Matching has
  // nothing to do here) renders nothing at all, same convention as the
  // Follow-ups card just above it in this same page ("nothing renders
  // while there's no sequence at all").
  if (!result || result.outcome === "not_applicable") return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg mb-4 flex items-center gap-2">
        <Building2 className="size-4 text-gold" /> Passende Immobilien
      </h2>

      {result.outcome === "no_properties" && (
        <div className="text-sm">
          <p className="text-muted-foreground">Noch keine Immobilien angelegt.</p>
          <Link
            to="/properties/new"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-gold text-gold-foreground hover:opacity-90 transition"
          >
            Immobilie hinzufügen
          </Link>
        </div>
      )}

      {result.outcome === "insufficient_criteria" && (
        <p className="text-sm text-muted-foreground">
          Noch nicht genügend Suchkriterien für eine zuverlässige Bewertung.
        </p>
      )}

      {result.outcome === "scored" &&
        (() => {
          const good = result.matches.filter((m) => m.score >= MIN_DISPLAY_SCORE);
          const weak = result.matches.filter((m) => m.score < MIN_DISPLAY_SCORE);
          return (
            <div>
              {good.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aktuell keine ausreichend passenden Immobilien.
                </p>
              ) : (
                <div className="space-y-3">
                  {good.map((m) => (
                    <MatchCard key={m.property.id} match={m} />
                  ))}
                </div>
              )}
              {weak.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowWeak((v) => !v)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    {showWeak ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    {showWeak
                      ? "Schwächere Kandidaten ausblenden"
                      : `${weak.length} weitere, schwächere Kandidaten anzeigen`}
                  </button>
                  {showWeak && (
                    <div className="mt-3 space-y-3">
                      {weak.map((m) => (
                        <MatchCard key={m.property.id} match={m} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
