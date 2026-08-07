// Central Analytics V1 data layer. Follows the same createServerFn +
// requireSupabaseAuth pattern as src/lib/appointments/appointments.functions.ts
// and src/lib/billing/billing.functions.ts: `context.supabase` is bound to
// the caller's own JWT (RLS-enforced, not service role). Almost all of the
// tenant isolation here comes from a single Postgres function
// (`analytics_summary`, see the migration) that itself has no company_id
// parameter at all — RLS on `leads`/`appointments` restricts every
// aggregate it computes to the caller's own rows, so there is no
// company_id trust decision to make in this file either.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ANALYTICS_WINDOWS,
  type AnalyticsWindow,
  computeConversionRate,
  computeFunnel,
  computeTrend,
  dayBucketKey,
  enumerateDayBuckets,
  getWindowBounds,
} from "@/lib/analytics/analytics-rules";

const analyticsInputSchema = z.object({ window: z.enum(ANALYTICS_WINDOWS) });

export type AnalyticsSummary = {
  window: AnalyticsWindow;
  windowStart: string;
  windowEnd: string;
  leads: {
    totalAllTime: number;
    inWindow: number;
    inPreviousWindow: number | null;
    byStatus: { neu: number; qualifiziert: number; termin: number };
    byScore: { hot: number; warm: number; cold: number };
    avgScoreNumeric: number | null;
  };
  appointments: {
    inWindow: number;
    inWindowByStatus: { scheduled: number; completed: number; cancelled: number };
    inPreviousWindow: number | null;
    currentlyScheduled: number;
  };
  legacy: {
    /** All-time, deliberately not window-scoped — see analytics-rules.ts
     * and the migration comment for why. */
    terminWithoutAppointmentAllTime: number;
  };
  conversion: {
    /** Cohort rate, see computeConversionRate's doc comment. Null when the
     * window's lead cohort is empty. */
    leadToAppointmentCohortRatePct: number | null;
  };
  funnel: ReturnType<typeof computeFunnel>;
  trends: {
    leads: ReturnType<typeof computeTrend>;
    appointments: ReturnType<typeof computeTrend>;
  };
  /** Only populated for the 7d/30d/90d presets — "all time" has no daily
   * chart, see getLeadsSeries below. Empty array (not omitted) for "all",
   * so the UI can render a single, consistent "not available at this
   * window" empty state instead of branching on a missing field. */
  series: {
    leadsByDay: { date: string; count: number }[];
    appointmentsByDay: { date: string; scheduled: number; completed: number; cancelled: number }[];
  };
};

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseInt(v, 10) || 0;
  return 0;
}

function toNullableAvg(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isNaN(n) ? null : n;
}

export const getAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyticsInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AnalyticsSummary> => {
    const { supabase } = context;
    const now = new Date();
    const bounds = getWindowBounds(data.window, now);

    const { data: rows, error } = await supabase.rpc("analytics_summary", {
      window_start: bounds.start.toISOString(),
      window_end: bounds.end.toISOString(),
      prev_start: bounds.previousStart?.toISOString() ?? bounds.start.toISOString(),
      prev_end: bounds.previousEnd?.toISOString() ?? bounds.start.toISOString(),
    });
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) throw new Error("Analytics-Daten konnten nicht geladen werden.");

    const leadsInWindow = toNumber(row.leads_in_window);
    const leadsInPrevWindow = bounds.previousStart ? toNumber(row.leads_in_prev_window) : null;
    const appointmentsInWindow = toNumber(row.appt_in_window);
    const appointmentsInPrevWindow = bounds.previousStart
      ? toNumber(row.appt_in_prev_window)
      : null;
    const qualifiziert = toNumber(row.leads_status_qualifiziert);
    const termin = toNumber(row.leads_status_termin);
    const leadsWithRealAppointment = toNumber(row.leads_with_real_appointment);

    // Only fetch day-bucketed series for the finite presets — "all time"
    // would mean bucketing years of history by day, which is neither fast
    // nor readable (see enumerateDayBuckets' MAX_DAY_BUCKETS guard, and
    // the migration's reasoning for not building this into the SQL
    // function at all). Each query below selects a single non-PII column
    // scoped by the existing (company_id, created_at)/(company_id,
    // starts_at) indexes — RLS still restricts both to the caller's own
    // company, exactly like every other query in this file.
    let leadsByDay: { date: string; count: number }[] = [];
    let appointmentsByDay: {
      date: string;
      scheduled: number;
      completed: number;
      cancelled: number;
    }[] = [];

    if (data.window !== "all") {
      const buckets = enumerateDayBuckets(bounds.start, bounds.end);
      const leadCounts = new Map(buckets.map((d) => [d, 0]));
      const apptCounts = new Map(
        buckets.map((d) => [d, { scheduled: 0, completed: 0, cancelled: 0 }]),
      );

      const [{ data: leadDates, error: leadDatesErr }, { data: apptDates, error: apptDatesErr }] =
        await Promise.all([
          supabase
            .from("leads")
            .select("created_at")
            .gte("created_at", bounds.start.toISOString())
            .lt("created_at", bounds.end.toISOString()),
          supabase
            .from("appointments")
            .select("starts_at, status")
            .gte("starts_at", bounds.start.toISOString())
            .lt("starts_at", bounds.end.toISOString()),
        ]);
      if (leadDatesErr) throw new Error(leadDatesErr.message);
      if (apptDatesErr) throw new Error(apptDatesErr.message);

      for (const l of leadDates ?? []) {
        const key = dayBucketKey(l.created_at);
        if (leadCounts.has(key)) leadCounts.set(key, (leadCounts.get(key) ?? 0) + 1);
      }
      for (const a of apptDates ?? []) {
        const key = dayBucketKey(a.starts_at);
        const bucket = apptCounts.get(key);
        if (!bucket) continue;
        if (a.status === "scheduled") bucket.scheduled += 1;
        else if (a.status === "completed") bucket.completed += 1;
        else if (a.status === "cancelled") bucket.cancelled += 1;
      }

      leadsByDay = buckets.map((date) => ({ date, count: leadCounts.get(date) ?? 0 }));
      appointmentsByDay = buckets.map((date) => ({ date, ...apptCounts.get(date)! }));
    }

    return {
      window: data.window,
      windowStart: bounds.start.toISOString(),
      windowEnd: bounds.end.toISOString(),
      leads: {
        totalAllTime: toNumber(row.leads_total),
        inWindow: leadsInWindow,
        inPreviousWindow: leadsInPrevWindow,
        byStatus: {
          neu: toNumber(row.leads_status_neu),
          qualifiziert,
          termin,
        },
        byScore: {
          hot: toNumber(row.leads_score_hot),
          warm: toNumber(row.leads_score_warm),
          cold: toNumber(row.leads_score_cold),
        },
        avgScoreNumeric: toNullableAvg(row.leads_avg_score_numeric),
      },
      appointments: {
        inWindow: appointmentsInWindow,
        inWindowByStatus: {
          scheduled: toNumber(row.appt_in_window_scheduled),
          completed: toNumber(row.appt_in_window_completed),
          cancelled: toNumber(row.appt_in_window_cancelled),
        },
        inPreviousWindow: appointmentsInPrevWindow,
        currentlyScheduled: toNumber(row.appt_currently_scheduled),
      },
      legacy: {
        terminWithoutAppointmentAllTime: toNumber(row.legacy_termin_without_appointment_all_time),
      },
      conversion: {
        leadToAppointmentCohortRatePct: computeConversionRate(
          leadsWithRealAppointment,
          leadsInWindow,
        ),
      },
      funnel: computeFunnel({
        leadsInWindow,
        qualifiziertOrTerminInWindow: qualifiziert + termin,
        leadsWithRealAppointmentInWindow: leadsWithRealAppointment,
      }),
      trends: {
        leads: computeTrend(leadsInWindow, leadsInPrevWindow),
        appointments: computeTrend(appointmentsInWindow, appointmentsInPrevWindow),
      },
      series: { leadsByDay, appointmentsByDay },
    };
  });
