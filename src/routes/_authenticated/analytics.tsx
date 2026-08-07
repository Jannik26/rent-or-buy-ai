import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Calendar, Info, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAnalyticsSummary } from "@/lib/analytics/analytics.functions";
import {
  ANALYTICS_WINDOWS,
  ANALYTICS_WINDOW_LABELS,
  formatAvgScore,
  formatRate,
  type AnalyticsWindow,
  type Trend,
} from "@/lib/analytics/analytics-rules";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics – EstateAI" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [window_, setWindow] = useState<AnalyticsWindow>("30d");
  const fetchSummary = useServerFn(getAnalyticsSummary);
  const query = useQuery({
    queryKey: ["analytics-summary", window_],
    queryFn: () => fetchSummary({ data: { window: window_ } }),
    refetchInterval: 60000,
  });

  const data = query.data;

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Performance Ihrer Lead-Pipeline.</p>
        </div>
        <WindowFilter value={window_} onChange={setWindow} />
      </div>

      {query.isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Lade…</div>
      ) : query.isError ? (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          Analytics-Daten konnten nicht geladen werden.{" "}
          {query.error instanceof Error ? query.error.message : ""}
        </div>
      ) : data ? (
        <AnalyticsBody data={data} />
      ) : null}
    </div>
  );
}

function WindowFilter({
  value,
  onChange,
}: {
  value: AnalyticsWindow;
  onChange: (w: AnalyticsWindow) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-soft">
      {ANALYTICS_WINDOWS.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === w
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {ANALYTICS_WINDOW_LABELS[w]}
        </button>
      ))}
    </div>
  );
}

type AnalyticsData = NonNullable<
  ReturnType<typeof useQuery<Awaited<ReturnType<typeof getAnalyticsSummary>>>>["data"]
>;

function AnalyticsBody({ data }: { data: AnalyticsData }) {
  const noLeadsAtAll = data.leads.totalAllTime === 0;

  if (noLeadsAtAll) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
        <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
          <BarChart3 className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
          Noch keine Leads vorhanden. Sobald jemand mit Ihrem EstateAI-Chat spricht, erscheinen hier
          Auswertungen.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Neue Leads"
          value={data.leads.inWindow}
          trend={data.trends.leads}
          icon={Users}
          tone="primary"
        />
        <KpiCard
          label="Ø Lead-Score"
          value={formatAvgScore(data.leads.avgScoreNumeric)}
          hint={data.leads.inWindow === 0 ? "Keine Leads im Zeitraum" : "0–100, KI-Einschätzung"}
          icon={TrendingUp}
          tone="gold"
        />
        <KpiCard
          label="Aktive Termine"
          value={data.appointments.currentlyScheduled}
          hint="Aktuell geplant, unabhängig vom Zeitfenster"
          icon={Calendar}
          tone="success"
        />
        <KpiCard
          label="Lead → Termin"
          value={formatRate(data.conversion.leadToAppointmentCohortRatePct)}
          hint={
            data.leads.inWindow === 0
              ? "Keine Leads im Zeitraum"
              : `von ${data.leads.inWindow} Leads im Zeitraum`
          }
          icon={BarChart3}
          tone="info"
        />
      </div>

      {data.legacy.terminWithoutAppointmentAllTime > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-xs text-foreground">
          <Info className="size-4 shrink-0 mt-0.5 text-gold" />
          <span>
            {data.legacy.terminWithoutAppointmentAllTime}{" "}
            {data.legacy.terminWithoutAppointmentAllTime === 1 ? "Lead trägt" : "Leads tragen"} den
            Status „Termin", aber ohne erfasstes Datum (z. B. direkt im Chat erkannt). Diese sind in
            „Aktive Termine" und „Lead → Termin" absichtlich <strong>nicht</strong> mitgezählt — nur
            echte, datierte Termine zählen dort. Datum im jeweiligen Lead nachtragen, um sie korrekt
            zu erfassen.
          </span>
        </div>
      )}

      {/* Funnel + distributions */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <FunnelCard stages={data.funnel} />
        <DistributionCard
          title="Leads nach Status"
          bars={[
            { label: "Neu", count: data.leads.byStatus.neu, color: "var(--muted-foreground)" },
            {
              label: "Qualifiziert",
              count: data.leads.byStatus.qualifiziert,
              color: "var(--info)",
            },
            { label: "Termin", count: data.leads.byStatus.termin, color: "var(--gold)" },
          ]}
        />
        <DistributionCard
          title="Leads nach Score"
          bars={[
            { label: "🔥 Hot", count: data.leads.byScore.hot, color: "var(--destructive)" },
            { label: "🟠 Warm", count: data.leads.byScore.warm, color: "var(--gold)" },
            { label: "🔵 Cold", count: data.leads.byScore.cold, color: "var(--info)" },
          ]}
        />
      </div>

      {/* Termine nach Status im Zeitraum */}
      <div className="mt-4">
        <DistributionCard
          title="Termine im Zeitraum nach Status"
          bars={[
            {
              label: "Geplant",
              count: data.appointments.inWindowByStatus.scheduled,
              color: "var(--gold)",
            },
            {
              label: "Abgeschlossen",
              count: data.appointments.inWindowByStatus.completed,
              color: "var(--success)",
            },
            {
              label: "Storniert",
              count: data.appointments.inWindowByStatus.cancelled,
              color: "var(--muted-foreground)",
            },
          ]}
          trend={data.trends.appointments}
        />
      </div>

      {/* Time series */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SeriesCard title="Lead-Verlauf" window={data.window}>
          {data.series.leadsByDay.length > 0 && data.series.leadsByDay.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={data.series.leadsByDay}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayTick}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  labelFormatter={formatDayTick}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Neue Leads"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState window={data.window} />
          )}
        </SeriesCard>

        <SeriesCard title="Termine über Zeit" window={data.window}>
          {data.series.appointmentsByDay.length > 0 &&
          data.series.appointmentsByDay.some((d) => d.scheduled + d.completed + d.cancelled > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.series.appointmentsByDay}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayTick}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  labelFormatter={formatDayTick}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="scheduled"
                  name="Geplant"
                  stackId="a"
                  fill="var(--gold)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="completed"
                  name="Abgeschlossen"
                  stackId="a"
                  fill="var(--success)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="cancelled"
                  name="Storniert"
                  stackId="a"
                  fill="var(--muted-foreground)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState window={data.window} />
          )}
        </SeriesCard>
      </div>
    </>
  );
}

function formatDayTick(value: string) {
  const d = new Date(`${value}T00:00:00.000Z`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function ChartEmptyState({ window: w }: { window: AnalyticsWindow }) {
  return (
    <div className="h-[220px] grid place-items-center text-center px-6">
      <p className="text-xs text-muted-foreground max-w-xs">
        {w === "all"
          ? "Für den gesamten Zeitraum wird kein Tagesverlauf angezeigt — bitte 7, 30 oder 90 Tage wählen."
          : "Keine Daten im gewählten Zeitraum."}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  trend?: Trend;
  hint?: string;
  icon: typeof Users;
  tone: "primary" | "gold" | "success" | "info";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    gold: "bg-gold/15 text-gold-foreground",
    success: "bg-success/15 text-success",
    info: "bg-info/10 text-info",
  }[tone];
  const trendClass = trend
    ? {
        up: "text-success",
        down: "text-destructive",
        flat: "text-muted-foreground",
        new: "text-primary",
        unavailable: "text-muted-foreground",
      }[trend.kind]
    : "";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
          <div className="mt-2 font-display text-3xl sm:text-4xl tabular-nums">{value}</div>
        </div>
        <div className={cn("size-11 rounded-xl grid place-items-center shrink-0", toneClass)}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-4 min-h-[20px] text-xs">
        {trend ? (
          <span className={cn("font-semibold", trendClass)}>
            {trend.label}
            {trend.kind !== "unavailable" && (
              <span className="ml-1 font-normal text-muted-foreground">vs. Vorperiode</span>
            )}
          </span>
        ) : hint ? (
          <span className="text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

function FunnelCard({ stages }: { stages: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Funnel</h2>
      <div className="mt-4 space-y-3">
        {stages.map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{s.count}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(2, Math.round((s.count / max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        Nur Stufen, die das Datenmodell heute abbildet: Lead → qualifiziert (Status) → Termin
        (echter, datierter Appointment).
      </p>
    </div>
  );
}

function DistributionCard({
  title,
  bars,
  trend,
}: {
  title: string;
  bars: { label: string; count: number; color: string }[];
  trend?: Trend;
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const total = bars.reduce((sum, b) => sum + b.count, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h2>
        {trend && trend.kind !== "unavailable" && (
          <span className="text-xs font-semibold text-muted-foreground">{trend.label}</span>
        )}
      </div>
      {total === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Keine Daten im Zeitraum.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: b.color }}
                  />
                  {b.label}
                </span>
                <span className="tabular-nums text-muted-foreground">{b.count}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(b.count === 0 ? 0 : 2, Math.round((b.count / max) * 100))}%`,
                    backgroundColor: b.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeriesCard({
  title,
  window: w,
  children,
}: {
  title: string;
  window: AnalyticsWindow;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">{ANALYTICS_WINDOW_LABELS[w]}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
