import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight, Building2, Code2, Copy, Flame, LogOut, Mail, MessageSquare, Phone, RefreshCcw, Settings, Snowflake, Users, Check,
} from "lucide-react";
import logo from "@/assets/setter-logo.png";
import { cn } from "@/lib/utils";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  intent: "kauf" | "miete" | "unbekannt";
  object_desc: string | null;
  budget: string | null;
  financing: string | null;
  timeframe: string | null;
  income: string | null;
  household_size: string | null;
  move_in_date: string | null;
  score: "hot" | "warm" | "cold";
  status: string;
  qualification_summary: string | null;
  messages: { role: string; content: string }[];
  created_at: string;
};

type Company = { id: string; name: string; greeting: string };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – SetterAI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"leads" | "embed" | "settings">("leads");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  useEffect(() => {
    if (!selectedId && leads[0]) setSelectedId(leads[0].id);
  }, [leads, selectedId]);

  const stats = useMemo(() => {
    return {
      total: leads.length,
      hot: leads.filter((l) => l.score === "hot").length,
      warm: leads.filter((l) => l.score === "warm").length,
      cold: leads.filter((l) => l.score === "cold").length,
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
          <span className="font-display text-xl">SetterAI</span>
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
            <div className="px-8 pt-8 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-3xl">Leads</h1>
                  <p className="text-sm text-muted-foreground mt-1">Qualifizierte Interessenten aus Ihrem KI-Chat.</p>
                </div>
                <button onClick={() => leadsQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
                  <RefreshCcw className="size-4" /> Aktualisieren
                </button>
              </div>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Alle Leads" value={stats.total} />
                <Stat label="🔥 Hot" value={stats.hot} tone="hot" />
                <Stat label="🟡 Warm" value={stats.warm} tone="warm" />
                <Stat label="❄️ Cold" value={stats.cold} tone="cold" />
              </div>
            </div>

            <div className="flex-1 min-h-0 grid lg:grid-cols-[420px_1fr]">
              <div className="border-r border-border overflow-y-auto">
                {leads.length === 0 && (
                  <div className="p-10 text-center">
                    <Users className="size-10 mx-auto text-muted-foreground/40" />
                    <p className="mt-4 text-sm text-muted-foreground">Noch keine Leads. Sobald jemand mit Ihrem Chat-Widget spricht, erscheint er hier.</p>
                    <button onClick={() => setTab("embed")} className="mt-4 text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                      Widget einbetten <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                )}
                {leads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={cn(
                      "w-full text-left px-5 py-4 border-b border-border hover:bg-accent/50 transition flex gap-3",
                      selected?.id === l.id && "bg-accent",
                    )}
                  >
                    <ScoreBadge score={l.score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{l.name ?? "Anonymer Besucher"}</div>
                        <div className="text-[11px] text-muted-foreground shrink-0">{relTime(l.created_at)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <IntentChip intent={l.intent} />
                        {l.budget && <span className="truncate">· {l.budget}</span>}
                      </div>
                      {l.qualification_summary && (
                        <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{l.qualification_summary}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto bg-muted/20">
                {selected ? <LeadDetail lead={selected} /> : null}
              </div>
            </div>
          </>
        )}

        {tab === "embed" && company && <EmbedTab companyId={company.id} />}
        {tab === "settings" && company && <SettingsTab company={company} onSaved={() => companyQuery.refetch()} />}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "hot" | "warm" | "cold" }) {
  const colors = tone === "hot" ? "text-destructive" : tone === "warm" ? "text-warning" : tone === "cold" ? "text-info" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl", colors)}>{value}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: "hot" | "warm" | "cold" }) {
  const cfg = {
    hot: { bg: "bg-destructive/10 text-destructive", Icon: Flame },
    warm: { bg: "bg-warning/15 text-warning", Icon: MessageSquare },
    cold: { bg: "bg-info/10 text-info", Icon: Snowflake },
  }[score];
  const Icon = cfg.Icon;
  return (
    <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", cfg.bg)}>
      <Icon className="size-4" />
    </div>
  );
}

function IntentChip({ intent }: { intent: "kauf" | "miete" | "unbekannt" }) {
  if (intent === "unbekannt") return <span className="text-muted-foreground">Noch unklar</span>;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
      intent === "kauf" ? "bg-gold/20 text-gold-foreground" : "bg-secondary/10 text-secondary")}>{intent}</span>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">{lead.name ?? "Anonymer Besucher"}</h2>
          <div className="mt-1 text-sm text-muted-foreground">Eingegangen {new Date(lead.created_at).toLocaleString("de-DE")}</div>
        </div>
        <ScoreBadge score={lead.score} />
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {lead.email && <ContactRow icon={Mail} label="E-Mail" value={lead.email} href={`mailto:${lead.email}`} />}
        {lead.phone && <ContactRow icon={Phone} label="Telefon" value={lead.phone} href={`tel:${lead.phone}`} />}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-lg mb-3">Qualifizierung</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Interesse" value={lead.intent === "unbekannt" ? "—" : lead.intent.toUpperCase()} />
          <Field label="Objekt" value={lead.object_desc} />
          <Field label="Budget" value={lead.budget} />
          {lead.intent === "kauf" && <>
            <Field label="Finanzierung" value={lead.financing} />
            <Field label="Kaufzeitraum" value={lead.timeframe} />
          </>}
          {lead.intent === "miete" && <>
            <Field label="Einkommen" value={lead.income} />
            <Field label="Personen" value={lead.household_size} />
            <Field label="Einzug" value={lead.move_in_date} />
          </>}
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-lg mb-3">Gesprächsverlauf</h3>
        <div className="space-y-3">
          {(lead.messages ?? []).map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-xl px-3.5 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, href }: { icon: typeof Mail; label: string; value: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 hover:bg-accent transition">
      <div className="size-9 rounded-lg bg-accent grid place-items-center text-primary"><Icon className="size-4" /></div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </a>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value || "—"}</dd>
    </div>
  );
}

function EmbedTab({ companyId }: { companyId: string }) {
  const [copied, setCopied] = useState(false);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${base}/embed.js" data-setterai="${companyId}" defer></script>`;
  function copy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Kopiert");
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="font-display text-3xl">Widget einbetten</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fügen Sie diesen einen Code-Schnipsel vor <code>{"</body>"}</code> in Ihre Website ein. Das Chat-Widget erscheint automatisch unten rechts.</p>
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
          { i: 3, t: "Fertig", d: "Besucher chatten ab sofort mit SetterAI." },
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
      <p className="mt-2 text-sm text-muted-foreground">Personalisieren Sie Ihren KI-Assistenten.</p>
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

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} h`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}
