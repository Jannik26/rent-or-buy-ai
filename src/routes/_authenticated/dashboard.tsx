import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight, ArrowUpRight, Building2, Calendar, Check, Code2, Copy,
  Flame, Search, Sparkles, TrendingUp, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SCORE_CONFIG } from "@/lib/lead-summary-schema";


export type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  intent: "kauf" | "verkauf" | "bewertung" | "miete" | "sonstiges" | "unbekannt";
  property_type: string | null;
  location: string | null;
  object_desc: string | null;
  motivation: string | null;
  ownership_status: string | null;
  usage_type: string | null;
  budget: string | null;
  asking_price: string | null;
  financing: string | null;
  timeframe: string | null;
  income: string | null;
  household_size: string | null;
  move_in_date: string | null;
  score: "hot" | "warm" | "cold";
  score_numeric: number;
  status: string;
  ai_summary: string | null;
  next_action: string | null;
  qualification_summary: string | null;
  summary_generated_at: string | null;
  messages: { role: string; content: string }[];
  created_at: string;
  updated_at: string;
};

type Company = { id: string; name: string; greeting: string; subscription_status: string | null; demo_expires_at: string | null };
type Profile = { full_name: string | null; email: string | null; company: string | null };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – EstateAI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [tab, setTab] = useState<"leads" | "embed" | "settings">("leads");
  const [search, setSearch] = useState("");

  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not authed");
      const { data, error } = await supabase
        .from("companies").select("id, name, greeting, subscription_status, demo_expires_at").eq("owner_id", user.id).maybeSingle();
      if (error) throw error;
      if (data) return data as Company;
      // Safety net: auto-create a company for authenticated users that don't have one yet.
      const fallbackName =
        (user.user_metadata?.company_name as string | undefined) ||
        (user.user_metadata?.full_name ? `${user.user_metadata.full_name} Immobilien` : null) ||
        "Meine Firma";
      const { data: created, error: insErr } = await supabase
        .from("companies")
        .insert({ owner_id: user.id, name: fallbackName })
        .select("id, name, greeting, subscription_status, demo_expires_at")
        .single();
      if (insErr) throw insErr;
      return created as Company;
    },
  });

  const company = companyQuery.data;

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles").select("full_name, email, company").eq("id", user.id).maybeSingle();
      return (data ?? { full_name: null, email: user.email, company: null }) as Profile;
    },
  });
  const profile = profileQuery.data;

  const leadsQuery = useQuery({
    queryKey: ["leads", company?.id],
    queryFn: async () => {
      if (!company) return [];
      const { data, error } = await supabase
        .from("leads").select("*").eq("company_id", company.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
    enabled: !!company,
    refetchInterval: 12000,
  });
  const leads = leadsQuery.data ?? [];

  const stats = useMemo(() => {
    const now = Date.now();
    const last7 = leads.filter((l) => now - new Date(l.created_at).getTime() < 7 * 864e5);
    const qualified = leads.filter((l) => l.status === "qualifiziert" || l.status === "termin" || l.score_numeric >= 60).length;
    return {
      total: leads.length,
      newWeek: last7.length,
      hot: leads.filter((l) => l.score === "hot").length,
      termine: leads.filter((l) => l.status === "termin").length,
      conversion: leads.length ? Math.round((qualified / leads.length) * 100) : 0,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) =>
      (l.name ?? "").toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.location ?? "").toLowerCase().includes(q) ||
      (l.property_type ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  return (
    <>
      {tab === "leads" && (
        <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl truncate">
                Willkommen zurück{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {stats.newWeek > 0 ? `${stats.newWeek} neue Leads in den letzten 7 Tagen.` : "Noch keine neuen Leads diese Woche."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-64 shadow-soft">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Leads durchsuchen…"
                  className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
                />
              </div>
              <button
                onClick={() => setTab("embed")}
                className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-secondary transition shadow-sm"
              >
                <Sparkles className="size-4" /> Widget einbetten
              </button>
            </div>
          </div>

          {company && <TrialBanner company={company} />}

          {/* Stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Neue Leads" value={stats.total} delta={stats.newWeek} deltaLabel="diese Woche" icon={Users} tone="primary" to="/leads" search={{ filter: "new" }} />
            <StatCard label="Heiße Leads" value={stats.hot} icon={Flame} tone="hot" hint="KI empfiehlt Priorität" to="/leads" search={{ filter: "hot" }} />
            <StatCard label="Termine" value={stats.termine} icon={Calendar} tone="gold" hint="Vereinbart" to="/appointments" />
            <StatCard label="Conversion Rate" value={`${stats.conversion}%`} icon={TrendingUp} tone="success" progress={stats.conversion} to="/analytics" />
          </div>

          {/* Leads */}
          <section className="mt-8 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 sm:px-6 py-4 border-b border-border">
              <div className="min-w-0">
                <h2 className="font-display text-lg">Letzte Leads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredLeads.length} von {leads.length} {leads.length === 1 ? "Lead" : "Leads"}
                </p>
              </div>
              <Link to="/leads" className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Alle anzeigen <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            {filteredLeads.length === 0 ? (
              <EmptyState onAction={() => setTab("embed")} />
            ) : (
              <LeadsTable leads={filteredLeads} />
            )}
          </section>
        </div>
      )}

      {tab === "embed" && company && <EmbedTab companyId={company.id} />}
      {tab === "settings" && company && <SettingsTab company={company} onSaved={() => companyQuery.refetch()} />}
    </>
  );
}





function TrialBanner({ company }: { company: Company }) {
  if (company.subscription_status !== "trial") return null;
  const expires = company.demo_expires_at ? new Date(company.demo_expires_at) : null;
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
  const expired = daysLeft === null || daysLeft <= 0;
  return (
    <div
      className={cn(
        "mt-4 rounded-xl border px-4 py-2.5 text-sm",
        expired ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-gold/30 bg-gold/10 text-gold-foreground",
      )}
    >
      {expired
        ? "Demo abgelaufen."
        : `Demo läuft bis ${expires!.toLocaleDateString("de-DE")} · noch ${daysLeft} Tag${daysLeft === 1 ? "" : "e"}.`}
    </div>
  );
}

function StatCard({
  label, value, delta, deltaLabel, icon: Icon, tone, hint, progress, to, search,
}: {
  label: string; value: number | string; delta?: number; deltaLabel?: string;
  icon: typeof Flame; tone: "primary" | "hot" | "gold" | "success"; hint?: string; progress?: number;
  to: "/leads" | "/appointments" | "/analytics"; search?: Record<string, string>;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    hot: "bg-destructive/10 text-destructive",
    gold: "bg-gold/15 text-gold-foreground",
    success: "bg-success/15 text-success",
  }[tone];
  const progressClass = {
    primary: "bg-primary", hot: "bg-destructive", gold: "bg-gold", success: "bg-success",
  }[tone];
  return (
    <Link
      to={to}
      search={search}
      className="group block rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-elegant transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="mt-2 font-display text-3xl sm:text-4xl tabular-nums">{value}</div>
        </div>
        <div className={cn("size-11 rounded-xl grid place-items-center shrink-0", toneClass)}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-4 min-h-[20px]">
        {progress !== undefined ? (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all", progressClass)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        ) : delta !== undefined ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className={cn("inline-flex items-center gap-0.5 font-semibold", delta > 0 ? "text-success" : "text-muted-foreground")}>
              <ArrowUpRight className="size-3" />+{delta}
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        ) : hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </Link>
  );
}

function EmptyState({ onAction }: { onAction: () => void }) {
  return (
    <div className="p-12 sm:p-16 text-center">
      <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
        <Users className="size-6 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground max-w-sm mx-auto">
        Noch keine Leads. Sobald jemand mit Ihrem EstateAI-Chat spricht, erscheint er hier.
      </p>
      <button onClick={onAction} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-secondary">
        Widget einbetten <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

function LeadsTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
            <th className="text-left font-semibold px-6 py-3">Kunde</th>
            <th className="text-left font-semibold px-4 py-3">Typ</th>
            <th className="text-left font-semibold px-4 py-3">Immobilie</th>
            <th className="text-left font-semibold px-4 py-3">Motivation</th>
            <th className="text-left font-semibold px-4 py-3 w-[200px]">KI-Score</th>
            <th className="text-left font-semibold px-4 py-3">Status</th>
            <th className="text-left font-semibold px-4 py-3">Datum</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadRow({ lead: l }: { lead: Lead }) {
  const navigate = useNavigate();
  const initials = (l.name ?? "??").split(" ").slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
  const open = () => navigate({ to: "/leads/$leadId", params: { leadId: l.id } });
  return (
    <tr
      className="border-b border-border last:border-0 hover:bg-muted/30 transition group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      role="link"
      tabIndex={0}
      aria-label={`Lead ${l.name ?? "Anonymer Besucher"} öffnen`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-full bg-gradient-navy text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{l.name ?? "Anonymer Besucher"}</div>
            <div className="text-xs text-muted-foreground truncate">{l.email ?? l.phone ?? "—"}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4"><IntentChip intent={l.intent} /></td>
      <td className="px-4 py-4 text-muted-foreground">
        <div className="truncate max-w-[200px]">{l.property_type ?? l.object_desc ?? "—"}</div>
        {l.location && <div className="text-xs text-muted-foreground/70 truncate">{l.location}</div>}
      </td>
      <td className="px-4 py-4 text-muted-foreground">
        <div className="truncate max-w-[220px]">{l.motivation ?? "—"}</div>
      </td>
      <td className="px-4 py-4">
        <ScoreBar score={l.score} num={l.score_numeric} />
      </td>
      <td className="px-4 py-4"><StatusBadge status={l.status} score={l.score} /></td>
      <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(l.created_at)}
      </td>
    </tr>
  );
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return `vor ${days}d`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export function ScoreBar({ score, num }: { score: "hot" | "warm" | "cold"; num: number }) {
  const cls = score === "hot" ? "bg-destructive" : score === "warm" ? "bg-warning" : "bg-info";
  return (
    <div className="flex items-center gap-2.5 min-w-[160px]" title="KI-Einschätzung – bitte manuell prüfen">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", cls)} style={{ width: `${Math.max(4, Math.min(100, num))}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-9 text-right">{num}</span>
    </div>
  );
}

// Backwards-compat export still used in lead detail page
export function ScorePill({ score, num }: { score: "hot" | "warm" | "cold"; num: number }) {
  const cfg = SCORE_CONFIG[score];
  return (
    <span
      title="KI-Einschätzung – bitte manuell prüfen"
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.badgeCls)}
    >
      <span>{cfg.emoji}</span> {cfg.label.toUpperCase()} · {num}/100
    </span>
  );
}

export function StatusBadge({ status, score }: { status: string; score?: "hot" | "warm" | "cold" }) {
  // Combined status that prioritizes lead temperature
  const temp = score ?? "cold";
  const tempCfg = SCORE_CONFIG[temp];
  const isMeeting = status === "termin";
  const isQualified = status === "qualifiziert";
  return (
    <div className="flex flex-col gap-1 items-start">
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", tempCfg.badgeCls)}>
        <span>{tempCfg.emoji}</span> {tempCfg.label}
      </span>
      {(isMeeting || isQualified) && (
        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
          {isMeeting ? "Termin" : "Qualifiziert"}
        </span>
      )}
    </div>
  );
}

export function IntentChip({ intent }: { intent: Lead["intent"] }) {
  if (intent === "unbekannt") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { cls: string; label: string }> = {
    kauf: { cls: "bg-secondary/10 text-secondary border-secondary/20", label: "Käufer" },
    verkauf: { cls: "bg-gold/15 text-gold-foreground border-gold/30", label: "Verkäufer" },
    bewertung: { cls: "bg-info/10 text-info border-info/20", label: "Bewertung" },
    miete: { cls: "bg-accent text-primary border-border", label: "Mieter" },
    sonstiges: { cls: "bg-muted text-muted-foreground border-border", label: "Sonstiges" },
  };
  const c = map[intent] ?? { cls: "bg-muted text-muted-foreground border-border", label: intent };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", c.cls)}>
      {c.label}
    </span>
  );
}

function EmbedTab({ companyId }: { companyId: string }) {
  const [copied, setCopied] = useState(false);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${base}/embed.js" data-estateai="${companyId}" defer></script>`;
  function copy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Kopiert");
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl">Widget einbetten</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fügen Sie diesen Code-Schnipsel vor <code>{"</body>"}</code> in Ihre Website ein. Das EstateAI-Widget erscheint automatisch unten rechts.</p>
      <div className="mt-6 rounded-2xl bg-primary text-primary-foreground p-5 font-mono text-xs sm:text-sm relative overflow-x-auto shadow-elegant">
        <pre className="whitespace-pre-wrap break-all pr-24">{snippet}</pre>
        <button onClick={copy} className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-gold text-gold-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        {[
          { i: 1, t: "Code kopieren", d: "Den obigen Schnipsel in die Zwischenablage." },
          { i: 2, t: "In Website einfügen", d: "Vor dem schließenden </body>-Tag." },
          { i: 3, t: "Fertig", d: "Besucher chatten ab sofort mit EstateAI." },
        ].map((s) => (
          <div key={s.i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="size-8 rounded-lg bg-gradient-navy text-gold grid place-items-center font-display">{s.i}</div>
            <div className="mt-3 font-medium">{s.t}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h3 className="font-display text-lg flex items-center gap-2"><Building2 className="size-4 text-gold" /> Vorschau</h3>
        <p className="text-sm text-muted-foreground mt-1">So sehen Ihre Besucher das Widget.</p>
        <a href="/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:text-gold">
          Live-Demo öffnen <ArrowRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function SettingsTab({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [name, setName] = useState(company.name);
  const [greeting, setGreeting] = useState(company.greeting);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(company.name);
    setGreeting(company.greeting);
  }, [company.id, company.name, company.greeting]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("companies").update({ name, greeting }).eq("id", company.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onSaved(); }
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl">Einstellungen</h1>
      <p className="mt-2 text-sm text-muted-foreground">Personalisieren Sie Ihren EstateAI-Assistenten.</p>
      <form onSubmit={save} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div>
          <label className="text-sm font-medium">Unternehmensname</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-sm font-medium">Begrüßung</label>
          <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
          <p className="mt-1.5 text-xs text-muted-foreground">Die erste Nachricht, die Besucher sehen.</p>
        </div>
        <button type="submit" disabled={busy} className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50">
          {busy ? "Speichern…" : "Änderungen speichern"}
        </button>
      </form>
    </div>
  );
}
