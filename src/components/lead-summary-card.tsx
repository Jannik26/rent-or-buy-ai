import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Banknote, Clock, Flame, Home, MapPin, RefreshCw, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { regenerateLeadSummary } from "@/lib/lead-summary.functions";
import { SCORE_CONFIG, type LeadIntent, type LeadScore } from "@/lib/lead-summary-schema";

type LeadLike = {
  id: string;
  intent: LeadIntent;
  score: LeadScore;
  score_numeric: number;
  property_type: string | null;
  location: string | null;
  timeframe: string | null;
  motivation: string | null;
  budget: string | null;
  asking_price: string | null;
  financing: string | null;
  next_action: string | null;
  ai_summary: string | null;
  summary_generated_at: string | null;
};

export function LeadSummaryCard({ lead, onUpdated }: { lead: LeadLike; onUpdated?: () => void }) {
  const fn = useServerFn(regenerateLeadSummary);
  const mut = useMutation({
    mutationFn: () => fn({ data: { leadId: lead.id } }),
    onSuccess: () => {
      toast.success("KI-Analyse aktualisiert");
      onUpdated?.();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler bei der KI-Analyse"),
  });

  const scoreCfg = SCORE_CONFIG[lead.score];
  const showBudget = lead.intent === "kauf" || lead.intent === "miete";
  const showAsking = lead.intent === "verkauf" || lead.intent === "bewertung";

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5 text-gold" /> KI-Lead-Zusammenfassung
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", scoreCfg.badgeCls)}>
              <span>{scoreCfg.emoji}</span> {scoreCfg.label}
            </span>
            <span className="font-display text-lg text-foreground tabular-nums">
              {lead.score_numeric}<span className="text-xs font-sans text-muted-foreground">/100</span>
            </span>
          </div>
          {lead.summary_generated_at && (
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              Aktualisiert {new Date(lead.summary_generated_at).toLocaleString("de-DE")}
            </span>
          )}
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", mut.isPending && "animate-spin")} />
            {mut.isPending ? "Analysiere…" : "KI-Analyse aktualisieren"}
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Recommended next action — most prominent */}
        <div className="rounded-xl bg-gold/8 p-4 flex items-start gap-3">
          <div className="size-8 rounded-lg bg-gold/15 grid place-items-center text-gold shrink-0">
            <Target className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-gold font-semibold">Empfohlene nächste Aktion</div>
            <div className="mt-0.5 text-base font-medium text-foreground">
              {lead.next_action ?? "—"}
            </div>
          </div>
        </div>

        {/* AI summary */}
        <p className="max-w-[65ch] text-sm leading-relaxed text-foreground">
          {lead.ai_summary ?? "Noch keine KI-Zusammenfassung — klicken Sie auf »KI-Analyse aktualisieren«, sobald das Gespräch beendet ist."}
        </p>

        {/* Primary facts */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <Fact icon={Home} label="Immobilientyp" value={lead.property_type} />
          <Fact icon={MapPin} label="Stadt / Region" value={lead.location} />
          <Fact icon={Clock} label="Zeitraum" value={lead.timeframe} />
          <Fact icon={Flame} label="Motivation" value={lead.motivation} />
        </dl>

        {/* Secondary facts */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 border-t border-border/60 pt-4">
          {showBudget && <Fact icon={Wallet} label="Budget" value={lead.budget} muted />}
          {showAsking && <Fact icon={Banknote} label="Preisvorstellung" value={lead.asking_price} muted />}
          <Fact icon={TrendingUp} label="Finanzierung" value={lead.financing} muted />
        </dl>
      </div>
    </section>
  );
}

function Fact({ icon: Icon, label, value, muted }: { icon: typeof Home; label: string; value: string | null | undefined; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={cn("flex items-center gap-1.5 uppercase tracking-wide", muted ? "text-[10px] text-muted-foreground/70" : "text-[11px] text-muted-foreground")}>
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className={cn("mt-1 break-words text-foreground", muted ? "text-xs font-medium" : "text-sm font-medium")}>{value || "—"}</dd>
    </div>
  );
}
