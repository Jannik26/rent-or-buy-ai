// Pure, unit-tested rules for the Analytics V1 slice — no Supabase I/O here
// (that lives in analytics.functions.ts). Same split as
// src/lib/billing/subscription-status.ts and
// src/lib/appointments/appointment-rules.ts: every non-trivial decision
// (window bounds, trend semantics, conversion rate) is a plain function so
// it can be tested without a database, and so its definition lives in
// exactly one place instead of being reimplemented in SQL and in the UI.

export const ANALYTICS_WINDOWS = ["7d", "30d", "90d", "all"] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export const ANALYTICS_WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  "90d": "Letzte 90 Tage",
  all: "Gesamter Zeitraum",
};

const WINDOW_DAYS: Record<Exclude<AnalyticsWindow, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type WindowBounds = {
  /** Inclusive start, UTC. */
  start: Date;
  /** Exclusive end, UTC — always "now" (the instant the window was computed). */
  end: Date;
  /**
   * The immediately preceding period of the same length, used for trend
   * comparison. `null` for "all" — there is no meaningful "period before
   * all time", so trends are never shown for that preset (see
   * computeTrend below, which also treats a null previous count as
   * "no comparison available").
   */
  previousStart: Date | null;
  previousEnd: Date | null;
};

/**
 * A day far enough in the past to include every row this app could ever
 * have (the project's `companies`/`leads` tables did not exist before
 * 2026). Used as the "all time" lower bound instead of a magic epoch, so a
 * `created_at >= start` comparison in SQL still works uniformly across all
 * four presets without a separate code path.
 */
const ALL_TIME_START = new Date("2020-01-01T00:00:00.000Z");

/** Single source of truth for what each window preset means, in UTC,
 * relative to `now`. `now` is always passed in explicitly (never read
 * internally) so results are deterministic and testable — same reasoning
 * as `subscription-status.ts`. */
export function getWindowBounds(preset: AnalyticsWindow, now: Date): WindowBounds {
  if (preset === "all") {
    return { start: ALL_TIME_START, end: now, previousStart: null, previousEnd: null };
  }
  const days = WINDOW_DAYS[preset];
  const dayMs = 86_400_000;
  const start = new Date(now.getTime() - days * dayMs);
  const previousEnd = start;
  const previousStart = new Date(start.getTime() - days * dayMs);
  return { start, end: now, previousStart, previousEnd };
}

export type Trend = {
  kind: "up" | "down" | "flat" | "new" | "unavailable";
  /** Rounded percentage change, e.g. 12 for "+12%". Null whenever a
   * percentage would be misleading or undefined (see kind). */
  deltaPct: number | null;
  /** Ready-to-render label — the one place this formatting decision is
   * made, so cards never each invent their own "+Infinity%" edge case. */
  label: string;
};

/**
 * Compares a window's count against the immediately preceding window of
 * the same length. `previous === null` means no comparison period exists
 * at all (the "all time" preset) — distinct from `previous === 0`, which
 * means the period existed but had no data.
 */
export function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) {
    return { kind: "unavailable", deltaPct: null, label: "—" };
  }
  if (previous === 0 && current === 0) {
    return { kind: "flat", deltaPct: null, label: "—" };
  }
  if (previous === 0) {
    // current > 0 here — a genuine jump from nothing, not a percentage.
    return { kind: "new", deltaPct: null, label: "Neu" };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const kind = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  const label = deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`;
  return { kind, deltaPct, label };
}

/**
 * Lead → Appointment conversion, cohort semantics (not activity
 * semantics): of the leads CREATED in the window (the denominator), how
 * many have at least one real `appointments` row, regardless of when that
 * appointment was created or scheduled. This deliberately never divides
 * two numbers with different time bases (e.g. "appointments booked this
 * week" / "leads created this week" would overcount/undercount leads
 * whose appointment fell outside the same window) — see ROADMAP.md
 * section 9 discussion this slice is based on.
 *
 * Returns null when there is no cohort to convert (denominator 0) — never
 * 0%, which would misleadingly imply a measured zero conversion rate.
 */
export function computeConversionRate(
  leadsWithAppointment: number,
  leadsInCohort: number,
): number | null {
  if (leadsInCohort === 0) return null;
  return Math.round((leadsWithAppointment / leadsInCohort) * 100);
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

export function formatAvgScore(avg: number | null): string {
  return avg === null ? "—" : String(Math.round(avg));
}

export type FunnelStage = {
  key: "leads" | "qualifiziert" | "termin";
  label: string;
  count: number;
};

/**
 * The only funnel this data model can currently support without inventing
 * a stage: Lead → qualifiziert (status progressed past "neu") → Termin
 * (a real appointment exists). All three canonical `leads.status` values
 * this app ever writes (`neu`/`qualifiziert`/`termin`, see
 * widget.chat.ts ALLOWED_STATUS) are accounted for; no "Bewerbung" or
 * "Abschluss" stage exists in the schema yet, so none is shown.
 */
export function computeFunnel(input: {
  leadsInWindow: number;
  qualifiziertOrTerminInWindow: number;
  leadsWithRealAppointmentInWindow: number;
}): FunnelStage[] {
  return [
    { key: "leads", label: "Leads", count: input.leadsInWindow },
    { key: "qualifiziert", label: "Qualifiziert", count: input.qualifiziertOrTerminInWindow },
    { key: "termin", label: "Termin", count: input.leadsWithRealAppointmentInWindow },
  ];
}

/** UTC calendar-day bucket key (`YYYY-MM-DD`) for a timestamp — used to
 * group both the lead and appointment time series. UTC, not the viewer's
 * local time: the stored `timestamptz` columns are UTC internally, and
 * bucketing by UTC day keeps the series stable regardless of which
 * timezone the dashboard is viewed from (only the axis *labels* are
 * localized in the UI, not the bucket boundaries themselves). */
export function dayBucketKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Hard cap on how many day buckets this function will ever produce.
 * Callers only ever use this for the 7d/30d/90d presets (max 90 days) —
 * "all time" deliberately has no daily chart (see analytics.functions.ts),
 * since bucketing years of history by day would be both slow and
 * unreadable. The cap is a defensive backstop, not an expected path. */
const MAX_DAY_BUCKETS = 366;

/** Every UTC calendar day in `[start, end)`, inclusive of the start day —
 * used so a day-bucketed chart shows real zeros instead of gaps for days
 * with no activity. Throws if the range would exceed MAX_DAY_BUCKETS. */
export function enumerateDayBuckets(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor.getTime() <= last.getTime()) {
    if (days.length >= MAX_DAY_BUCKETS) {
      throw new Error(`enumerateDayBuckets: range exceeds ${MAX_DAY_BUCKETS} days`);
    }
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
