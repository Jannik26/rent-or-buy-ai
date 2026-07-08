import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Calendar, CheckCircle2, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntentChip, StatusBadge, type Lead } from "../dashboard";
import { LeadSummaryCard } from "@/components/lead-summary-card";
import type { LeadIntent, LeadScore } from "@/lib/lead-summary-schema";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead-Details – EstateAI" }] }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      return data as unknown as Lead | null;
    },
    refetchInterval: 8000,
  });

  if (q.isLoading) return <div className="p-10 text-sm text-muted-foreground">Lade…</div>;
  const lead = q.data;
  if (!lead) {
    return (
      <div className="p-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="size-4" /> Zurück</Link>
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Lead nicht gefunden.</div>
      </div>
    );
  }

  async function markStatus(status: string) {
    setBusy(true);
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Status aktualisiert"); q.refetch(); }
  }

  

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-8 py-6 flex items-center justify-between">
          <button onClick={() => navigate({ to: "/dashboard" })} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowLeft className="size-4" /> Alle Leads
          </button>
          <div className="flex items-center gap-2">
            {/* TODO: Pro-Lead-Löschfunktion (DSGVO-Löschfristen, siehe src/lib/data-retention.ts) */}
            <button disabled={busy} onClick={() => markStatus("qualifiziert")} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">Als qualifiziert markieren</button>
            <button disabled={busy} onClick={() => markStatus("termin")} className="rounded-lg bg-gold text-gold-foreground px-3 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" /> Termin vereinbart
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-10 grid lg:grid-cols-[1fr_320px] gap-8">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl">{lead.name ?? "Anonymer Besucher"}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                Eingegangen {new Date(lead.created_at).toLocaleString("de-DE")}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <IntentChip intent={lead.intent} />
                <StatusBadge status={lead.status} score={lead.score} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {lead.email && <ContactRow icon={Mail} label="E-Mail" value={lead.email} href={`mailto:${lead.email}`} />}
            {lead.phone && <ContactRow icon={Phone} label="Telefon" value={lead.phone} href={`tel:${lead.phone}`} />}
          </div>

          {/* AI Lead Summary Card */}
          <div className="mt-6">
            <LeadSummaryCard
              lead={{
                id: lead.id,
                intent: lead.intent as LeadIntent,
                score: lead.score as LeadScore,
                score_numeric: lead.score_numeric,
                property_type: lead.property_type,
                location: lead.location,
                timeframe: lead.timeframe ?? lead.move_in_date,
                motivation: lead.motivation,
                budget: lead.budget,
                asking_price: lead.asking_price ?? null,
                financing: lead.financing,
                next_action: lead.next_action,
                ai_summary: lead.ai_summary ?? lead.qualification_summary,
                summary_generated_at: lead.summary_generated_at ?? null,
              }}
              onUpdated={() => q.refetch()}
            />
          </div>

          {/* Qualification Fields */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg mb-4">Qualifizierung</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Immobilientyp" value={lead.property_type} />
              <Field label="Standort" value={lead.location} />
              <Field label="Objektbeschreibung" value={lead.object_desc} />
              <Field label="Motivation / Verkaufsgrund" value={lead.motivation} />
              <Field label="Eigentümerstatus" value={lead.ownership_status} />
              <Field label="Nutzung" value={lead.usage_type} />
              <Field label="Budget" value={lead.budget} />
              <Field label="Finanzierung" value={lead.financing} />
              <Field label="Zeitraum" value={lead.timeframe ?? lead.move_in_date} />
            </dl>
          </div>

          {/* Conversation */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg mb-4">Gesprächsverlauf</h2>
            <div className="space-y-3">
              {(lead.messages ?? []).map((m: { role: string; content: string }, i: number) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}>
                    {m.content}
                  </div>
                </div>
              ))}
              {(!lead.messages || lead.messages.length === 0) && (
                <div className="text-sm text-muted-foreground">Noch keine Nachrichten.</div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Checkliste</div>
            <ul className="space-y-2">
              {[
                { k: "Name", v: !!lead.name },
                { k: "Kontakt (E-Mail/Tel.)", v: !!(lead.email || lead.phone) },
                { k: "Absicht klar", v: lead.intent !== "unbekannt" },
                { k: "Objekt/Budget bekannt", v: !!(lead.property_type || lead.object_desc || lead.budget) },
                { k: "Zeitraum bekannt", v: !!(lead.timeframe || lead.move_in_date) },
              ].map((c) => (
                <li key={c.k} className="flex items-center gap-2">
                  <CheckCircle2 className={cn("size-4", c.v ? "text-success" : "text-muted-foreground/30")} />
                  <span className={cn(c.v ? "text-foreground" : "text-muted-foreground")}>{c.k}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value || "—"}</dd>
    </div>
  );
}
