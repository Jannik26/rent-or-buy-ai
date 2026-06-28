// Provider-agnostic lead-summary contract.
// Any model (Gemini, Claude, OpenAI, …) returns this exact JSON shape.
// Keep enums lower-case and field names stable for forward compatibility.
import { z } from "zod";

export const LEAD_INTENTS = ["kauf", "verkauf", "bewertung", "miete", "sonstiges", "unbekannt"] as const;
export const LEAD_SCORES = ["hot", "warm", "cold"] as const;

export type LeadIntent = (typeof LEAD_INTENTS)[number];
export type LeadScore = (typeof LEAD_SCORES)[number];

/** Canonical structured lead summary. All textual fields are short German strings. */
export const LeadSummarySchema = z.object({
  score_numeric: z.number().int().min(0).max(100),
  score: z.enum(LEAD_SCORES),
  intent: z.enum(LEAD_INTENTS),
  property_type: z.string().nullable(),
  location: z.string().nullable(),
  timeframe: z.string().nullable(),
  motivation: z.string().nullable(),
  budget: z.string().nullable(),
  asking_price: z.string().nullable(),
  financing: z.string().nullable(),
  next_action: z.string(),
  ai_summary: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export type LeadSummary = z.infer<typeof LeadSummarySchema>;

/** German labels for UI rendering. */
export const INTENT_LABEL: Record<LeadIntent, string> = {
  kauf: "Käufer",
  verkauf: "Verkäufer",
  bewertung: "Bewertung",
  miete: "Mieter",
  sonstiges: "Sonstiges",
  unbekannt: "Unbekannt",
};

export const SCORE_LABEL: Record<LeadScore, string> = {
  hot: "🔥 Hot",
  warm: "🟠 Warm",
  cold: "🔵 Cold",
};

export function buildSummaryInstructions(): string {
  return `Du bist ein Immobilien-Vertriebsanalyst. Analysiere das Chat-Transkript zwischen einem Immobilien-KI-Assistenten und einem Interessenten und erstelle eine strukturierte Lead-Zusammenfassung.

Antworte ausschließlich mit JSON, das exakt diesem Schema folgt (alle Felder sind Pflicht, unbekannte Werte = null bzw. leerer String nicht zulässig — nutze null):

{
  "score_numeric": 0-100 (ganzzahliger Lead-Score),
  "score": "hot" | "warm" | "cold",
  "intent": "kauf" | "verkauf" | "bewertung" | "miete" | "sonstiges" | "unbekannt",
  "property_type": string|null (z.B. "Einfamilienhaus", "3-Zi-Wohnung"),
  "location": string|null (Stadt/PLZ/Region),
  "timeframe": string|null (z.B. "innerhalb 3 Monate"),
  "motivation": string|null (Grund / Beweggrund),
  "budget": string|null (nur bei Käufer, sonst null),
  "asking_price": string|null (nur bei Verkäufer, Preisvorstellung),
  "financing": string|null ("vorhanden" | "in Klärung" | "nein" | ...),
  "next_action": string (konkrete nächste Aktion für den Makler, max 120 Zeichen, Deutsch),
  "ai_summary": string (Lead-Zusammenfassung max 120 Wörter, Deutsch, neutral),
  "name": string|null,
  "email": string|null,
  "phone": string|null
}

Score-Heuristik:
- hot (≥75): vollständige Kontaktdaten, klare Absicht, konkretes Objekt/Budget, kurzer Zeitraum
- warm (45-74): Kontakt + Absicht klar, Details teilweise
- cold (<45): kaum Kontakt oder vage Absicht

Erfinde keine Werte. Nutze nur Informationen aus dem Transkript.`;
}
