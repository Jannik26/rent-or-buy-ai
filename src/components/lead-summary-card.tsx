import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Banknote, Clock, Flame, Home, MapPin, RefreshCw, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { regenerateLeadSummary } from "@/lib/lead-summary.functions";
import { INTENT_LABEL, SCORE_LABEL, type LeadIntent, type LeadScore } from "@/lib/lead-summary-schema";

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

  const scoreColor =
    lead.score === "hot"
      ? "from-destructive/20 to-destructive/5 text-destructive"
      : lead.score === "warm"
        ? "from-gold/25 to-gold/5 text-gold"
        : "from-info/15 to-info/5 text-info";

  const showBudget = lead.intent === "kauf" || lead.intent === "miete";
  const showAsking = lead.intent === "verkauf" || lead.intent === "bewertung";

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5 text-gold" /> KI-Lead-Zusammenfassung
        </div>
        <div className="flex items-center gap-3">
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

      <div className="grid lg:grid-cols-[260px_1fr] gap-0">
        {/* Score column */}
        <div className={cn("relative bg-gradient-to-br p-6 flex flex-col items-center justify-center text-center border-r border-border", scoreColor)}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Lead-Score</div>
          <div className="mt-1 font-display text-6xl text-foreground tabular-nums">
            {lead.score_numeric}
            <span className="text-2xl text-muted-foreground">/100</span>
          </div>
          <div className="mt-3 rounded-full bg-background/80 backdrop-blur px-3 py-1 text-xs font-semibold">
            {SCORE_LABEL[lead.score]}
          </div>
          <div className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Absicht</div>
          <div className="mt-0.5 text-sm font-semibold text-foreground">{INTENT_LABEL[lead.intent]}</div>
        </div>

        {/* Facts grid */}
        <div className="p-6 space-y-5">
          <p className="text-sm leading-relaxed text-foreground">
            {lead.ai_summary ?? "Noch keine KI-Zusammenfassung — klicken Sie auf »KI-Analyse aktualisieren«, sobald das Gespräch beendet ist."}
          </p>

          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Fact icon={Home} label="Immobilientyp" value={lead.property_type} />
            <Fact icon={MapPin} label="Stadt / Region" value={lead.location} />
            <Fact icon={Clock} label="Zeitraum" value={lead.timeframe} />
            <Fact icon={Flame} label="Motivation" value={lead.motivation} />
            {showBudget && <Fact icon={Wallet} label="Budget" value={lead.budget} />}
            {showAsking && <Fact icon={Banknote} label="Preisvorstellung" value={lead.asking_price} />}
            <Fact icon={TrendingUp} label="Finanzierung" value={lead.financing} />
          </dl>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-start gap-3">
            <div className="size-8 rounded-lg bg-gold/15 grid place-items-center text-gold shrink-0">
              <Target className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-gold font-semibold">Empfohlene nächste Aktion</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {lead.next_action ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground break-words">{value || "—"}</div>
    </div>
  );
}
