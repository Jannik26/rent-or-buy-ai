export type ResponseTimeValue = "24_hours" | "1_3_days";

export const DEFAULT_RESPONSE_TIME: ResponseTimeValue = "24_hours";

export const RESPONSE_TIME_OPTIONS: { value: ResponseTimeValue; label: string }[] = [
  { value: "24_hours", label: "24 Stunden" },
  { value: "1_3_days", label: "1–3 Werktage" },
];

/** Text, wie er im Chat-Abschlusssatz stehen soll: "...meldet sich innerhalb von {phrase}." */
export function responseTimePhrase(value: string | null | undefined): string {
  return value === "1_3_days" ? "1–3 Werktagen" : "24 Stunden";
}
