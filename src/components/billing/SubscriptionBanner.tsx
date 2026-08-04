import { useState } from "react";
import { getSubscriptionState, type SubscriptionInput } from "@/lib/billing/subscription-status";
import { SUPPORT_MAILTO_HREF } from "@/lib/support-contact";
import { cn } from "@/lib/utils";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";

type Tone = "quiet" | "warning" | "blocked";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "";
}

export function SubscriptionBanner({ company, now }: { company: SubscriptionInput; now: Date }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { state, reason, daysRemaining, relevantExpiryAt } = getSubscriptionState(company, now);

  if (state === "active" && reason !== "cancelled_grace_period") {
    return null;
  }

  let tone: Tone = "quiet";
  let lines: string[] = [];
  let showUpgradeCta = false;
  let showSupportCta = false;

  switch (reason) {
    case "cancelled_grace_period":
      tone = "quiet";
      lines = [
        `Ihr Abo wurde gekündigt, bleibt aber bis zum ${formatDate(relevantExpiryAt)} aktiv.`,
      ];
      showSupportCta = true;
      break;
    case "trial_active":
      tone = "quiet";
      lines = [`Noch ${daysRemaining} Tag${daysRemaining === 1 ? "" : "e"} in Ihrer Testphase.`];
      break;
    case "trial_ending_soon":
      tone = "warning";
      lines = [
        daysRemaining === 1 ? "Ihre Testphase endet morgen." : "Ihre Testphase endet in 2 Tagen.",
      ];
      showUpgradeCta = true;
      break;
    case "trial_grace":
      tone = "warning";
      lines = [
        "Ihre 14-tägige Testphase ist beendet.",
        `Sie haben noch ${daysRemaining} Tag${daysRemaining === 1 ? "" : "e"} Kulanzfrist, bevor der Zugriff gesperrt wird.`,
        "Bitte hinterlegen Sie ein Abo, um EstateAI ohne Unterbrechung weiter zu nutzen.",
      ];
      showUpgradeCta = true;
      showSupportCta = true;
      break;
    case "trial_lapsed":
      tone = "blocked";
      lines = [
        "Ihre Testphase inklusive Kulanzfrist ist abgelaufen.",
        "Aktivieren Sie jetzt ein Abo, um EstateAI weiter zu nutzen.",
      ];
      showUpgradeCta = true;
      showSupportCta = true;
      break;
    case "subscription_lapsed":
      tone = "blocked";
      lines = [
        "Ihr Abonnement ist abgelaufen.",
        "Bitte aktivieren Sie Ihr Abo erneut, um EstateAI weiter zu nutzen.",
      ];
      showUpgradeCta = true;
      showSupportCta = true;
      break;
    case "explicitly_cancelled":
      tone = "blocked";
      lines = ["Ihr Abonnement wurde gekündigt."];
      showUpgradeCta = true;
      showSupportCta = true;
      break;
    case "explicitly_locked":
      tone = "blocked";
      lines = [
        "Ihr Konto wurde vorübergehend gesperrt.",
        "Bitte kontaktieren Sie den Support, um Ihr Konto zu reaktivieren.",
      ];
      showSupportCta = true; // deliberately no self-serve checkout — this is an ops-side hold
      break;
    case "explicitly_expired":
    case "unknown_status":
    case "unclassified":
      tone = "blocked";
      lines = [
        "Ihr Zugang ist derzeit nicht aktiv.",
        "Bitte kontaktieren Sie uns, um Ihr Konto zu reaktivieren.",
      ];
      showSupportCta = true;
      break;
    default:
      return null;
  }

  const toneClass =
    tone === "blocked"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-gold/30 bg-gold/10 text-gold-foreground"
        : "border-border bg-muted/50 text-muted-foreground";

  return (
    <>
      <div
        className={cn(
          "mt-4 rounded-xl border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3",
          toneClass,
        )}
      >
        <div className="space-y-0.5">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {(showUpgradeCta || showSupportCta) && (
          <div className="flex gap-2 shrink-0">
            {showUpgradeCta && (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-secondary transition"
              >
                Jetzt upgraden
              </button>
            )}
            {showSupportCta && (
              <a
                href={SUPPORT_MAILTO_HREF}
                className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium hover:bg-black/5 transition"
              >
                Support kontaktieren
              </a>
            )}
          </div>
        )}
      </div>
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        reason={reason === "trial_lapsed" || reason === "trial_grace" ? "trial_ended" : "generic"}
      />
    </>
  );
}
