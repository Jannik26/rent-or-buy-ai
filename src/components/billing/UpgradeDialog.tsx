import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { createBillingCheckout } from "@/lib/billing/billing.functions";
import { SUPPORT_MAILTO_HREF } from "@/lib/support-contact";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BENEFITS = [
  "KI-gestützte Lead-Qualifizierung rund um die Uhr",
  "Automatische Terminvorschläge",
  "Unbegrenzte Gespräche",
  "Persönlicher Support",
];

const TITLES: Record<"trial_ended" | "feature_locked" | "generic", string> = {
  trial_ended: "Ihre Testphase ist abgelaufen",
  feature_locked: "Diese Funktion braucht ein aktives Abo",
  generic: "Upgrade auf EstateAI",
};

export function UpgradeDialog({
  open,
  onOpenChange,
  reason = "generic",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: "trial_ended" | "feature_locked" | "generic";
}) {
  const fn = useServerFn(createBillingCheckout);
  const mut = useMutation({
    mutationFn: () => fn({ data: {} }),
    onSuccess: (result) => {
      if (result.status === "redirect") {
        window.location.href = result.url;
      } else {
        toast.message(result.reason);
      }
    },
    onError: () =>
      toast.error("Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[reason]}</DialogTitle>
          <DialogDescription>
            Mit einem Abo nutzen Sie den KI-Chat, die automatische Lead-Qualifizierung und das
            Widget auf Ihrer Website ohne Einschränkung.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success shrink-0" />
              {benefit}
            </li>
          ))}
        </ul>

        <DialogFooter className="sm:flex-col sm:space-x-0 gap-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="w-full">
            {mut.isPending ? "Wird geladen …" : "Jetzt upgraden"}
          </Button>
          <div className="flex gap-2 w-full">
            <Button variant="outline" asChild className="flex-1">
              <a href={SUPPORT_MAILTO_HREF}>Support kontaktieren</a>
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" className="flex-1">
                Vielleicht später
              </Button>
            </DialogClose>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
