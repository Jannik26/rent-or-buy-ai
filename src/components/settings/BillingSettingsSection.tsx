import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getBillingSnapshot,
  createBillingCheckout,
  createBillingPortal,
} from "@/lib/billing/billing.functions";
import {
  BILLING_SNAPSHOT_QUERY_KEY,
  invalidateBillingCaches,
} from "@/lib/billing/billing-query-keys";
import {
  SUBSCRIPTION_STATE_LABELS,
  canAccessGatedFeatures,
} from "@/lib/billing/subscription-status";
import type { BillingPlan } from "@/lib/billing/billing-provider";
import { SUPPORT_MAILTO_HREF } from "@/lib/support-contact";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ComingSoonSettingsCard } from "@/components/settings/ComingSoonSettingsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PLAN_LABELS: Record<BillingPlan, string> = {
  basic: "Basic",
  professional: "Professional",
  enterprise: "Enterprise",
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "";
}

export function BillingSettingsSection() {
  const queryClient = useQueryClient();
  const snapshotFn = useServerFn(getBillingSnapshot);
  const query = useQuery({
    queryKey: BILLING_SNAPSHOT_QUERY_KEY,
    queryFn: () => snapshotFn(),
  });

  const checkoutFn = useServerFn(createBillingCheckout);
  const checkoutMut = useMutation({
    mutationFn: () => checkoutFn({ data: {} }),
    onSuccess: (result) => {
      if (result.status === "redirect") {
        window.location.href = result.url;
        invalidateBillingCaches(queryClient);
      } else {
        toast.message(result.reason);
      }
    },
    onError: () =>
      toast.error("Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut."),
  });

  const portalFn = useServerFn(createBillingPortal);
  const portalMut = useMutation({
    mutationFn: () => portalFn(),
    onSuccess: (result) => {
      if (result.status === "redirect") {
        window.location.href = result.url;
        invalidateBillingCaches(queryClient);
      } else {
        toast.message(result.reason);
      }
    },
    onError: () =>
      toast.error("Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut."),
  });

  if (query.isLoading) {
    return (
      <SettingsSection
        title="Abonnement und Abrechnung"
        description="Verwalte deinen Tarif, Rechnungen und Zahlungsmethoden."
      >
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
      </SettingsSection>
    );
  }

  const snapshot = query.data;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Abonnement und Abrechnung"
        description="Verwalte deinen Tarif, Rechnungen und Zahlungsmethoden."
      >
        {snapshot && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {snapshot.plan ? PLAN_LABELS[snapshot.plan] : "Kein Tarif"}
              </span>
              <Badge variant={canAccessGatedFeatures(snapshot.state) ? "secondary" : "destructive"}>
                {SUBSCRIPTION_STATE_LABELS[snapshot.state]}
              </Badge>
            </div>
            {snapshot.relevantExpiryAt && (
              <p
                className={
                  snapshot.state === "grace"
                    ? "text-sm font-medium text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {snapshot.state === "trial" || snapshot.state === "trial_expiring"
                  ? `Testphase endet am ${formatDate(snapshot.relevantExpiryAt)}.`
                  : snapshot.state === "grace"
                    ? `Testphase beendet. Noch ${snapshot.daysRemaining ?? 0} Tag${snapshot.daysRemaining === 1 ? "" : "e"} Kulanzfrist bis ${formatDate(snapshot.relevantExpiryAt)} — danach wird der Zugriff gesperrt. Bitte hinterlegen Sie ein Abo.`
                    : snapshot.reason === "cancelled_grace_period"
                      ? `Gekündigt, bleibt aktiv bis ${formatDate(snapshot.relevantExpiryAt)}.`
                      : `Verlängert sich am ${formatDate(snapshot.relevantExpiryAt)}.`}
              </p>
            )}
            {snapshot.state === "active" && snapshot.reason !== "cancelled_grace_period" ? (
              <Button
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending}
                variant="outline"
              >
                {portalMut.isPending ? "Wird geladen …" : "Abo verwalten"}
              </Button>
            ) : (
              <Button onClick={() => checkoutMut.mutate()} disabled={checkoutMut.isPending}>
                {checkoutMut.isPending ? "Wird geladen …" : "Jetzt upgraden"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Fragen zu Ihrem Abo?{" "}
              <a href={SUPPORT_MAILTO_HREF} className="underline">
                Support kontaktieren
              </a>
              .
            </p>
          </>
        )}
      </SettingsSection>

      <ComingSoonSettingsCard
        title="Zahlungsmethode"
        fields={["Kreditkarte", "SEPA-Lastschrift", "Rechnungsadresse"]}
      />
      <ComingSoonSettingsCard
        title="Rechnungen"
        fields={["Rechnungshistorie", "PDF-Download", "Automatischer Versand"]}
      />
    </div>
  );
}
