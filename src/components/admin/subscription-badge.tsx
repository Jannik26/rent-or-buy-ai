import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active: { cls: "bg-success/15 text-success border-success/20", label: "Aktiv" },
  trial: { cls: "bg-gold/15 text-gold-foreground border-gold/30", label: "Testphase" },
  expired: { cls: "bg-destructive/10 text-destructive border-destructive/20", label: "Abgelaufen" },
  paused: { cls: "bg-muted text-muted-foreground border-border", label: "Pausiert" },
  cancelled: {
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    label: "Gekündigt",
  },
};

export function SubscriptionStatusBadge({ status }: { status: string | null }) {
  const c = status
    ? (STATUS_MAP[status] ?? { cls: "bg-muted text-muted-foreground border-border", label: status })
    : { cls: "bg-muted text-muted-foreground border-border", label: "—" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}

export function TrialActiveBadge({
  subscriptionStatus,
  demoExpiresAt,
}: {
  subscriptionStatus: string | null;
  demoExpiresAt: string | null;
}) {
  if (subscriptionStatus !== "trial") return null;
  const expires = demoExpiresAt ? new Date(demoExpiresAt) : null;
  const active = expires ? expires.getTime() > Date.now() : false;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        active
          ? "border-gold/30 bg-gold/10 text-gold-foreground"
          : "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      {active ? "Läuft" : "Beendet"}
    </span>
  );
}

export const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  professional: "Professional",
  enterprise: "Enterprise",
};
