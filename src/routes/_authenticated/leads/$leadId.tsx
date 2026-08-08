import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Calendar, CheckCircle2, Mail, Pencil, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntentChip, StatusBadge, type Lead } from "../dashboard";
import { LeadSummaryCard } from "@/components/lead-summary-card";
import type { LeadIntent, LeadScore } from "@/lib/lead-summary-schema";
import {
  cancelAppointment,
  createAppointment,
  getLeadAppointments,
  restoreAppointment,
  setLegacyLeadStatus,
  updateAppointment,
} from "@/lib/appointments/appointments.functions";
import {
  LEAD_STATUS_ON_CANCEL_FALLBACK,
  dateTimeLocalValueToIso,
  isoToDateTimeLocalValue,
} from "@/lib/appointments/appointment-rules";
import { getConversationDetail } from "@/lib/conversations/conversations.functions";
import {
  cancelFollowupsForLead,
  getFollowupsForLead,
  type FollowupRow,
} from "@/lib/followups/followups.functions";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead-Details – EstateAI" }] }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState<"create" | "edit" | null>(null);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Lead | null;
    },
    refetchInterval: 8000,
  });

  const getAppointmentsFn = useServerFn(getLeadAppointments);
  const appointmentsQuery = useQuery({
    queryKey: ["lead-appointments", leadId],
    queryFn: () => getAppointmentsFn({ data: { leadId } }),
  });
  const appointments = appointmentsQuery.data ?? [];
  const currentAppointment = appointments.find((a) => a.status === "scheduled") ?? null;

  // Same server function (and therefore the exact same canonical data) the
  // Conversations page uses — one source of truth for chat history, never
  // two different reads that could drift (see ROADMAP.md's Conversations
  // Foundation entry).
  const fetchConversationDetail = useServerFn(getConversationDetail);
  const conversationQuery = useQuery({
    queryKey: ["conversation-detail", leadId],
    queryFn: () => fetchConversationDetail({ data: { leadId } }),
  });
  const messages = conversationQuery.data?.messages ?? [];

  const fetchFollowups = useServerFn(getFollowupsForLead);
  const followupsQuery = useQuery({
    queryKey: ["lead-followups", leadId],
    queryFn: () => fetchFollowups({ data: { leadId } }),
  });
  const followups = followupsQuery.data ?? [];
  const hasOpenFollowups = followups.some((f) => f.status === "scheduled");
  const cancelFollowupsFn = useServerFn(cancelFollowupsForLead);
  const [followupsBusy, setFollowupsBusy] = useState(false);

  async function handleStopFollowups() {
    setFollowupsBusy(true);
    try {
      await cancelFollowupsFn({ data: { leadId } });
      await qc.invalidateQueries({ queryKey: ["lead-followups", leadId] });
      toast.success("Automatische Nachfassaktionen gestoppt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Stoppen der Follow-ups.");
    } finally {
      setFollowupsBusy(false);
    }
  }

  const createFn = useServerFn(createAppointment);
  const updateFn = useServerFn(updateAppointment);
  const cancelFn = useServerFn(cancelAppointment);
  const restoreFn = useServerFn(restoreAppointment);
  const setLegacyFn = useServerFn(setLegacyLeadStatus);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-appointments", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  if (q.isLoading) return <div className="p-10 text-sm text-muted-foreground">Lade…</div>;
  const lead = q.data;
  if (!lead) {
    return (
      <div className="p-10">
        <Link
          to="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-4" /> Zurück
        </Link>
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Lead nicht gefunden.
        </div>
      </div>
    );
  }

  async function updateStatus(status: string) {
    setBusy(true);
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await q.refetch();
    qc.invalidateQueries({ queryKey: ["leads"] });
    return true;
  }

  async function markStatus(status: string) {
    if (await updateStatus(status)) toast.success("Status aktualisiert");
  }

  const currentStatus = lead.status;
  const isTermin = currentStatus === "termin";

  function openCreateForm() {
    const suggested = new Date();
    suggested.setDate(suggested.getDate() + 1);
    suggested.setHours(10, 0, 0, 0);
    setFormStartsAt(isoToDateTimeLocalValue(suggested.toISOString()));
    setFormLocation("");
    setFormNotes("");
    setFormError(null);
    setFormOpen("create");
  }

  function openEditForm() {
    if (!currentAppointment) return;
    setFormStartsAt(isoToDateTimeLocalValue(currentAppointment.starts_at));
    setFormLocation(currentAppointment.location ?? "");
    setFormNotes(currentAppointment.notes ?? "");
    setFormError(null);
    setFormOpen("edit");
  }

  function closeForm() {
    setFormOpen(null);
    setFormError(null);
  }

  async function submitForm() {
    const iso = dateTimeLocalValueToIso(formStartsAt);
    if (!iso) {
      setFormError("Bitte ein gültiges Datum und eine Uhrzeit angeben.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (formOpen === "create") {
        const result = await createFn({
          data: {
            leadId,
            startsAt: iso,
            location: formLocation.trim() || null,
            notes: formNotes.trim() || null,
          },
        });
        invalidateAll();
        closeForm();
        const appointmentId = result.appointment.id;
        const previousLeadStatus = result.previousLeadStatus;
        toast.success("Termin vereinbart", {
          action: {
            label: "Rückgängig",
            onClick: () => {
              void cancelFn({
                data: { appointmentId, revertLeadStatusTo: previousLeadStatus },
              }).then(invalidateAll);
            },
          },
        });
      } else if (formOpen === "edit" && currentAppointment) {
        await updateFn({
          data: {
            appointmentId: currentAppointment.id,
            startsAt: iso,
            location: formLocation.trim() || null,
            notes: formNotes.trim() || null,
          },
        });
        invalidateAll();
        closeForm();
        toast.success("Termin aktualisiert");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelAppointment() {
    if (!currentAppointment) return;
    const appointmentId = currentAppointment.id;
    setBusy(true);
    try {
      await cancelFn({ data: { appointmentId } });
      invalidateAll();
      toast.success("Termin zurückgenommen", {
        action: {
          label: "Rückgängig",
          onClick: () => {
            void restoreFn({ data: { appointmentId } }).then(invalidateAll);
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setBusy(false);
    }
  }

  // Legacy path: status = 'termin' (set by the dashboard toggle before this
  // feature existed, or directly by the AI chat — see widget.chat.ts
  // ALLOWED_STATUS) but no scheduled appointment row, i.e. no known date.
  // "Zurücknehmen" here has no appointment to cancel, so it flips the plain
  // status flag directly instead — its own inverse for "Rückgängig".
  async function handleClearLegacyTermin() {
    setBusy(true);
    try {
      await setLegacyFn({ data: { leadId, status: LEAD_STATUS_ON_CANCEL_FALLBACK } });
      invalidateAll();
      toast.success("Termin zurückgenommen", {
        action: {
          label: "Rückgängig",
          onClick: () => {
            void setLegacyFn({ data: { leadId, status: "termin" } }).then(invalidateAll);
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-8 py-6 flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-4" /> Alle Leads
          </button>
          <div className="flex items-center gap-2">
            {/* TODO: Pro-Lead-Löschfunktion (DSGVO-Löschfristen, siehe src/lib/data-retention.ts) */}
            <button
              disabled={busy}
              onClick={() => markStatus("qualifiziert")}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              Als qualifiziert markieren
            </button>

            {!isTermin && (
              <button
                disabled={busy}
                onClick={openCreateForm}
                className="rounded-lg px-3 py-2 text-xs font-medium bg-gold text-gold-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
              >
                <Calendar className="size-3.5" /> Termin vereinbaren
              </button>
            )}
            {isTermin && currentAppointment && (
              <>
                <button
                  disabled={busy}
                  onClick={openEditForm}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Pencil className="size-3.5" /> Termin bearbeiten
                </button>
                <button
                  disabled={busy}
                  onClick={handleCancelAppointment}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 text-muted-foreground"
                >
                  Termin zurücknehmen
                </button>
              </>
            )}
            {isTermin && !currentAppointment && (
              <>
                <button
                  disabled={busy}
                  onClick={openCreateForm}
                  className="rounded-lg px-3 py-2 text-xs font-medium bg-gold text-gold-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
                >
                  <Calendar className="size-3.5" /> Datum hinzufügen
                </button>
                <button
                  disabled={busy}
                  onClick={handleClearLegacyTermin}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 text-muted-foreground"
                >
                  Termin zurücknehmen
                </button>
              </>
            )}
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
            {lead.email && (
              <ContactRow
                icon={Mail}
                label="E-Mail"
                value={lead.email}
                href={`mailto:${lead.email}`}
              />
            )}
            {lead.phone && (
              <ContactRow
                icon={Phone}
                label="Telefon"
                value={lead.phone}
                href={`tel:${lead.phone}`}
              />
            )}
          </div>

          {/* Appointment */}
          {isTermin && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg mb-3 flex items-center gap-2">
                <Calendar className="size-4 text-gold" /> Termin
              </h2>
              {currentAppointment ? (
                <div className="text-sm space-y-1">
                  <div className="font-medium">
                    {new Date(currentAppointment.starts_at).toLocaleString("de-DE", {
                      dateStyle: "full",
                      timeStyle: "short",
                    })}
                  </div>
                  {currentAppointment.location && (
                    <div className="text-muted-foreground">{currentAppointment.location}</div>
                  )}
                  {currentAppointment.notes && (
                    <div className="text-muted-foreground mt-1">{currentAppointment.notes}</div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Termin vereinbart · Datum noch nicht erfasst.
                </p>
              )}
            </div>
          )}

          {/* Date/time form (create or edit) */}
          {formOpen && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg mb-4">
                {formOpen === "create" ? "Termin vereinbaren" : "Termin bearbeiten"}
              </h2>
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="text-sm font-medium">Datum &amp; Uhrzeit</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Ort (optional)</label>
                  <input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="z. B. Musterstraße 1, 12345 Berlin"
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notiz (optional)</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    disabled={busy}
                    onClick={submitForm}
                    className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    Bestätigen
                  </button>
                  <button
                    disabled={busy}
                    onClick={closeForm}
                    className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          )}

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
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex", m.senderType === "lead" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-3.5 py-2 text-sm leading-relaxed",
                      m.senderType === "lead"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground">Noch keine Nachrichten.</div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Checkliste
            </div>
            <ul className="space-y-2">
              {[
                { k: "Name", v: !!lead.name },
                { k: "Kontakt (E-Mail/Tel.)", v: !!(lead.email || lead.phone) },
                { k: "Absicht klar", v: lead.intent !== "unbekannt" },
                {
                  k: "Objekt/Budget bekannt",
                  v: !!(lead.property_type || lead.object_desc || lead.budget),
                },
                { k: "Zeitraum bekannt", v: !!(lead.timeframe || lead.move_in_date) },
              ].map((c) => (
                <li key={c.k} className="flex items-center gap-2">
                  <CheckCircle2
                    className={cn("size-4", c.v ? "text-success" : "text-muted-foreground/30")}
                  />
                  <span className={cn(c.v ? "text-foreground" : "text-muted-foreground")}>
                    {c.k}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Automated follow-ups (Product Track slice 5) — read-only
              status + an optional stop action, see ROADMAP.md. Nothing
              renders while there's no sequence at all (a lead whose first
              AI turn hasn't happened yet, or whose conversation never had
              one scheduled) — same "don't show an empty state for
              something that was never applicable" convention as the
              appointment card above. */}
          {followups.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Automatische Nachfassaktionen
                </div>
                {hasOpenFollowups && (
                  <button
                    disabled={followupsBusy}
                    onClick={handleStopFollowups}
                    className="text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    Follow-ups stoppen
                  </button>
                )}
              </div>
              <ul className="space-y-2.5">
                {followups.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">Schritt {f.step}</div>
                      <div className="text-xs text-muted-foreground">{formatFollowupTiming(f)}</div>
                    </div>
                    <FollowupStatusBadge status={f.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 hover:bg-accent transition"
    >
      <div className="size-9 rounded-lg bg-accent grid place-items-center text-primary">
        <Icon className="size-4" />
      </div>
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

const FOLLOWUP_STATUS_LABELS: Record<FollowupRow["status"], string> = {
  scheduled: "Geplant",
  processing: "Wird gesendet…",
  sent: "Gesendet",
  cancelled: "Gestoppt",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
};

const FOLLOWUP_STATUS_STYLES: Record<FollowupRow["status"], string> = {
  scheduled: "bg-accent text-foreground",
  processing: "bg-accent text-foreground",
  sent: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

function FollowupStatusBadge({ status }: { status: FollowupRow["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        FOLLOWUP_STATUS_STYLES[status],
      )}
    >
      {FOLLOWUP_STATUS_LABELS[status]}
    </span>
  );
}

/** Deliberately not formatDate (dashboard.tsx) — that helper reads
 * "vor Xd"/"Heute"/"Gestern", built for past timestamps, and would show a
 * nonsensical negative day count for a follow-up scheduled in the future.
 * A sent/cancelled/failed row instead shows when that actually happened
 * (sent_at/cancelled_at/failed_at), never the now-irrelevant original
 * scheduled_for. */
function formatFollowupTiming(f: FollowupRow): string {
  const iso =
    f.status === "sent"
      ? f.sentAt
      : f.status === "cancelled"
        ? f.cancelledAt
        : f.status === "failed"
          ? f.failedAt
          : f.scheduledFor;
  if (!iso) return "—";
  const prefix = f.status === "scheduled" || f.status === "processing" ? "Geplant für" : "";
  const formatted = new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return prefix ? `${prefix} ${formatted}` : formatted;
}
