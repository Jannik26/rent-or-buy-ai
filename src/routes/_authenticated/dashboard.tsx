import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight, Building2, Calendar, Code2, Copy, ExternalLink, Flame, LogOut, MessageSquare, RefreshCcw, Settings, Snowflake, Sparkles, Users, Check,
} from "lucide-react";
import logo from "@/assets/estateai-logo.png";
import { cn } from "@/lib/utils";

export type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  intent: "kauf" | "verkauf" | "bewertung" | "miete" | "unbekannt";
  property_type: string | null;
  location: string | null;
  object_desc: string | null;
  motivation: string | null;
  ownership_status: string | null;
  usage_type: string | null;
  budget: string | null;
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
  messages: { role: string; content: string }[];
  created_at: string;
};

type Company = { id: string; name: string; greeting: string };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – EstateAI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"leads" | "embed" | "settings">("leads");

  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not authed");
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, greeting")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });

  const company = companyQuery.data;

  const leadsQuery = useQuery({
    queryKey: ["leads", company?.id],
    queryFn: async () => {
      if (!company) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
    enabled: !!company,
    refetchInterval: 8000,
  });

  const leads = leadsQuery.data ?? [];

  const stats = useMemo(() => {
    const qualified = leads.filter((l) => l.status === "qualifiziert" || l.status === "termin" || l.score_numeric >= 45).length;
    const termine = leads.filter((l) => l.status === "termin").length;
    return {
      total: leads.length,
      qualified,
      hot: leads.filter((l) => l.score === "hot").length,
      termine,
    };
  }, [leads]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground p-5 flex flex-col">
        <Link to="/" className="flex items-center gap-2.5 mb-10">
          <img src={logo} alt="" className="size-9" width={36} height={36} />
          <span className="font-display text-xl">EstateAI</span>
        </Link>
        <nav className="space-y-1 text-sm">
          {[
            { k: "leads" as const, l: "Leads", i: Users },
            { k: "embed" as const, l: "Widget einbetten", i: Code2 },
            { k: "settings" as const, l: "Einstellungen", i: Settings },
          ].map(({ k, l, i: Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition",
                tab === k ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70",
              )}
            >
              <Icon className="size-4" /> {l}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-5 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs">
            <div className="text-sidebar-foreground/50">Unternehmen</div>
            <div className="font-medium mt-0.5 truncate">{company?.name ?? "—"}</div>
          </div>
          <button onClick={signOut} className="mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent/50 text-sidebar-foreground/70 text-sm">
            <LogOut className="size-4" /> Abmelden
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {tab === "leads" && (
          <>
            <div className="px-8 pt-8 pb-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-3xl">Leads</h1>
                  <p className="text-sm text-muted-foreground mt-1">Qualifizierte Interessenten aus Ihrem EstateAI-Chat.</p>
                </div>
                <button onClick={() => leadsQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
                  <RefreshCcw className="size-4" /> Aktualisieren
                </button>
              </div>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Neue Leads" value={stats.total} icon={Sparkles} />
                <Stat label="Qualifizierte Leads" value={stats.qualified} icon={MessageSquare} tone="warm" />
                <Stat label="🔥 Heiße Leads" value={stats.hot} tone="hot" icon={Flame} />
                <Stat label="Termine" value={stats.termine} icon={Calendar} tone="cold" />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-8">
              {leads.length === 0 ? (
                <div className="p-16 text-center rounded-2xl border border-dashed border-border bg-card">
                  <Users className="size-10 mx-auto text-muted-foreground/40" />
                  <p className="mt-4 text-sm text-muted-foreground">Noch keine Leads. Sobald jemand mit Ihrem EstateAI-Chat spricht, erscheint er hier.</p>
                  <button onClick={() => setTab("embed")} className="mt-4 text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                    Widget einbetten <ArrowRight className="size-3.5" />
                  </button>
                </div>
              ) : (
                <LeadsTable leads={leads} />
              )}
            </div>
          </>
        )}

        {tab === "embed" && company && <EmbedTab companyId={company.id} />}
        {tab === "settings" && company && <SettingsTab company={company} onSaved={() => companyQuery.refetch()} />}
      </main>
    </div>
  );
}

function LeadsTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Typ</th>
              <th className="text-left px-4 py-3 font-medium">Immobilie</th>
              <th className="text-left px-4 py-3 font-medium">Motivation</th>
              <th className="text-left px-4 py-3 font-medium">Zeitraum</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-accent/30 transition">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.name ?? "Anonymer Besucher"}</div>
                  <div className="text-xs text-muted-foreground">{l.email ?? l.phone ?? "—"}</div>
                </td>
                <td className="px-4 py-3"><IntentChip intent={l.intent} /></td>
                <td className="px-4 py-3 text-muted-foreground">{l.property_type ?? l.object_desc ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">{l.motivation ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.timeframe ?? l.move_in_date ?? "—"}</td>
                <td className="px-4 py-3"><ScorePill score={l.score} num={l.score_numeric} /></td>
                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: l.id }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-gold"
                  >
                    Details <ExternalLink className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: number; tone?: "hot" | "warm" | "cold"; icon: typeof Flame }) {
  const colors = tone === "hot" ? "text-destructive bg-destructive/10" : tone === "warm" ? "text-warning bg-warning/15" : tone === "cold" ? "text-info bg-info/10" : "text-primary bg-accent";
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className={cn("size-10 rounded-lg grid place-items-center shrink-0", colors)}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 font-display text-2xl">{value}</div>
      </div>
    </div>
  );
}

export function ScorePill({ score, num }: { score: "hot" | "warm" | "cold"; num: number }) {
  const cfg = {
    hot: { cls: "bg-destructive/10 text-destructive", label: "HOT", Icon: Flame },
    warm: { cls: "bg-warning/15 text-warning", label: "WARM", Icon: MessageSquare },
    cold: { cls: "bg-info/10 text-info", label: "COLD", Icon: Snowflake },
  }[score];
  const Icon = cfg.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.cls)}>
      <Icon className="size-3.5" /> {cfg.label} · {num}/100
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    neu: "bg-muted text-muted-foreground",
    qualifiziert: "bg-secondary/10 text-secondary",
    termin: "bg-gold/15 text-gold-foreground",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium", cls)}>{status}</span>;
}

export function IntentChip({ intent }: { intent: Lead["intent"] }) {
  if (intent === "unbekannt") return <span className="text-muted-foreground text-xs">Noch unklar</span>;
  const map: Record<string, string> = {
    kauf: "bg-secondary/10 text-secondary",
    verkauf: "bg-gold/15 text-gold-foreground",
    bewertung: "bg-info/10 text-info",
    miete: "bg-accent text-primary",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", map[intent])}>
      {intent === "kauf" ? "Käufer" : intent === "verkauf" ? "Verkäufer" : intent === "bewertung" ? "Bewertung" : "Mieter"}
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
    <div className="p-8 max-w-3xl">
      <h1 className="font-display text-3xl">Widget einbetten</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fügen Sie diesen Code-Schnipsel vor <code>{"</body>"}</code> in Ihre Website ein. Das EstateAI-Widget erscheint automatisch unten rechts.</p>
      <div className="mt-6 rounded-2xl bg-primary text-primary-foreground p-5 font-mono text-sm relative overflow-x-auto">
        <pre className="whitespace-pre-wrap break-all">{snippet}</pre>
        <button onClick={copy} className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-gold text-gold-foreground px-3 py-1.5 text-xs font-medium">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        {[
          { i: 1, t: "Code kopieren", d: "Den obigen Schnipsel in die Zwischenablage." },
          { i: 2, t: "In Ihre Website einfügen", d: "Vor dem schließenden </body>-Tag." },
          { i: 3, t: "Fertig", d: "Besucher chatten ab sofort mit EstateAI." },
        ].map((s) => (
          <div key={s.i} className="rounded-xl border border-border bg-card p-4">
            <div className="size-8 rounded-lg bg-gradient-navy text-gold grid place-items-center font-display">{s.i}</div>
            <div className="mt-3 font-medium">{s.t}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-lg flex items-center gap-2"><Building2 className="size-4 text-gold" /> Vorschau</h3>
        <p className="text-sm text-muted-foreground mt-1">So sehen Ihre Besucher das Widget.</p>
        <a href="/" target="_blank" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:text-gold">
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
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-3xl">Einstellungen</h1>
      <p className="mt-2 text-sm text-muted-foreground">Personalisieren Sie Ihren EstateAI-Assistenten.</p>
      <form onSubmit={save} className="mt-8 space-y-5">
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
