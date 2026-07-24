import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminUpdateCompany,
  type AdminCompanyOverviewRow,
  type AdminUpdateCompanyInput,
} from "@/lib/admin.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type Patch = Omit<AdminUpdateCompanyInput, "companyId" | "action">;
type SubscriptionStatus = NonNullable<Patch["subscription_status"]>;
type Plan = NonNullable<Patch["plan"]>;

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

const CRITICAL_STATUSES = new Set<SubscriptionStatus>(["cancelled", "expired"]);

export function CompanyEditDialog({
  company,
  open,
  onOpenChange,
  onUpdated,
}: {
  company: AdminCompanyOverviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<SubscriptionStatus | "">("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [demoStartedAt, setDemoStartedAt] = useState("");
  const [demoExpiresAt, setDemoExpiresAt] = useState("");
  const [subStartedAt, setSubStartedAt] = useState("");
  const [subExpiresAt, setSubExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmSave, setConfirmSave] = useState<{ patch: Patch; action: string } | null>(null);

  useEffect(() => {
    if (!company) return;
    setStatus((company.subscription_status as SubscriptionStatus | null) ?? "");
    setPlan((company.plan as Plan | null) ?? "");
    setDemoStartedAt(toLocalInputValue(company.demo_started_at));
    setDemoExpiresAt(toLocalInputValue(company.demo_expires_at));
    setSubStartedAt(toLocalInputValue(company.subscription_started_at));
    setSubExpiresAt(toLocalInputValue(company.subscription_expires_at));
    setNotes(company.admin_notes ?? "");
  }, [company]);

  const fn = useServerFn(adminUpdateCompany);
  const mut = useMutation({
    mutationFn: (input: { patch: Patch; action: string }) =>
      fn({ data: { companyId: company!.id, action: input.action, ...input.patch } }),
    onSuccess: () => {
      toast.success("Gespeichert");
      onUpdated();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler beim Speichern"),
  });

  function submit(patch: Patch, action: string) {
    if (patch.subscription_status && CRITICAL_STATUSES.has(patch.subscription_status)) {
      setConfirmSave({ patch, action });
      return;
    }
    mut.mutate({ patch, action });
  }

  function handleFormSave() {
    submit(
      {
        subscription_status: status || null,
        plan: plan || null,
        demo_started_at: fromLocalInputValue(demoStartedAt),
        demo_expires_at: fromLocalInputValue(demoExpiresAt),
        subscription_started_at: fromLocalInputValue(subStartedAt),
        subscription_expires_at: fromLocalInputValue(subExpiresAt),
        admin_notes: notes || null,
      },
      "Manuelle Änderung gespeichert",
    );
  }

  function extendTrial(days: number) {
    const base = demoExpiresAt ? new Date(fromLocalInputValue(demoExpiresAt)!) : new Date();
    const from = base.getTime() > Date.now() ? base : new Date();
    const next = new Date(from.getTime() + days * 86400000).toISOString();
    submit(
      { subscription_status: "trial", demo_expires_at: next },
      `Testphase um ${days} Tage verlängert`,
    );
  }

  function endTrial() {
    submit(
      { subscription_status: "expired", demo_expires_at: new Date().toISOString() },
      "Testphase beendet",
    );
  }

  function restartTrial() {
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 86400000);
    submit(
      {
        subscription_status: "trial",
        demo_started_at: now.toISOString(),
        demo_expires_at: expires.toISOString(),
      },
      "Testphase neu gestartet",
    );
  }

  if (!company) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{company.name} verwalten</DialogTitle>
            <DialogDescription>
              Testphase und Abonnement für dieses Unternehmen bearbeiten.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <QuickActionButton
              label="+7 Tage"
              onClick={() => extendTrial(7)}
              disabled={mut.isPending}
            />
            <QuickActionButton
              label="+14 Tage"
              onClick={() => extendTrial(14)}
              disabled={mut.isPending}
            />
            <QuickActionButton
              label="+30 Tage"
              onClick={() => extendTrial(30)}
              disabled={mut.isPending}
            />
            <QuickActionButton
              label="Testphase beenden"
              onClick={endTrial}
              disabled={mut.isPending}
              destructive
            />
            <QuickActionButton
              label="Testphase neu starten"
              onClick={restartTrial}
              disabled={mut.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— (kein Status)</option>
                <option value="trial">Testphase</option>
                <option value="active">Aktiv</option>
                <option value="expired">Abgelaufen</option>
                <option value="paused">Pausiert</option>
                <option value="cancelled">Gekündigt</option>
              </select>
            </Field>
            <Field label="Tarif">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as Plan)}
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— (kein Tarif)</option>
                <option value="basic">Basic</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="Testphase – Start">
              <DateInput value={demoStartedAt} onChange={setDemoStartedAt} />
            </Field>
            <Field label="Testphase – Ende">
              <DateInput value={demoExpiresAt} onChange={setDemoExpiresAt} />
            </Field>
            <Field label="Abo – Beginn">
              <DateInput value={subStartedAt} onChange={setSubStartedAt} />
            </Field>
            <Field label="Abo – Ablaufdatum">
              <DateInput value={subExpiresAt} onChange={setSubExpiresAt} />
            </Field>
          </div>

          <Field label="Notizen">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </Field>

          <DialogFooter>
            <button
              onClick={handleFormSave}
              disabled={mut.isPending}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary transition disabled:opacity-50"
            >
              {mut.isPending ? "Speichert…" : "Änderungen speichern"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSave !== null} onOpenChange={(o) => !o && setConfirmSave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderung bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              „{confirmSave?.action}" für {company.name} — das Widget dieses Unternehmens wird
              dadurch gesperrt. Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmSave) mut.mutate(confirmSave);
                setConfirmSave(null);
              }}
            >
              Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function QuickActionButton({
  label,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        destructive
          ? "rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 disabled:opacity-50"
          : "rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}
