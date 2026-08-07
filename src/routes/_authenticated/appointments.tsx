import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Clock, MapPin } from "lucide-react";
import { IntentChip, ScorePill, formatDate } from "./dashboard";
import { getCompanyAppointments } from "@/lib/appointments/appointments.functions";
import type { LeadIntent, LeadScore } from "@/lib/lead-summary-schema";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments – EstateAI" }] }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const fetchAppointments = useServerFn(getCompanyAppointments);
  const query = useQuery({
    queryKey: ["company-appointments"],
    queryFn: () => fetchAppointments(),
    refetchInterval: 15000,
  });

  const appointments = query.data?.appointments ?? [];
  const legacyLeadsWithoutDate = query.data?.legacyLeadsWithoutDate ?? [];
  const total = appointments.length + legacyLeadsWithoutDate.length;

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Appointments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {total > 0
          ? `${total} vereinbarte${total === 1 ? "r Termin" : " Termine"}.`
          : "Vereinbarte Termine mit Ihren Leads."}
      </p>

      {query.isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Lade…</div>
      ) : total === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
          <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
            <Calendar className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
            Noch keine vereinbarten Termine. Sobald ein Lead als Termin vereinbart markiert wird,
            erscheint er hier.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {appointments.map((a) => (
            <AppointmentCard key={a.id} appointment={a} />
          ))}
        </div>
      )}

      {legacyLeadsWithoutDate.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg">Ohne Datum erfasst</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Diese Leads wurden als „Termin vereinbart" markiert (z. B. direkt im Chat durch die KI),
            haben aber noch kein konkretes Datum. Datum im jeweiligen Lead nachtragen.
          </p>
          <div className="mt-4 space-y-3">
            {legacyLeadsWithoutDate.map((l) => (
              <LegacyLeadCard key={l.id as string} lead={l} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type AppointmentWithLead = {
  id: string;
  lead_id: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    intent: string;
    property_type: string | null;
    object_desc: string | null;
    ai_summary: string | null;
    qualification_summary: string | null;
    score: string;
    score_numeric: number;
  } | null;
};

function AppointmentCard({ appointment: a }: { appointment: AppointmentWithLead }) {
  const navigate = useNavigate();
  const lead = a.lead;
  const open = () => navigate({ to: "/leads/$leadId", params: { leadId: a.lead_id } });
  const summary = lead?.ai_summary ?? lead?.qualification_summary;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Lead ${lead?.name ?? "Anonymer Besucher"} öffnen`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-elegant transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{lead?.name ?? "Anonymer Besucher"}</span>
            {lead && <IntentChip intent={lead.intent as LeadIntent} />}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {lead?.email ?? lead?.phone ?? "—"}
          </div>
          {(lead?.property_type ?? lead?.object_desc) && (
            <div className="mt-1 text-sm text-muted-foreground">
              {lead?.property_type ?? lead?.object_desc}
            </div>
          )}
          {summary && (
            <p className="mt-2 text-sm text-foreground leading-relaxed line-clamp-2">{summary}</p>
          )}
          {a.location && (
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {a.location}
            </div>
          )}
        </div>
        <div className="flex sm:flex-col items-start sm:items-end gap-2 shrink-0">
          {lead && <ScorePill score={lead.score as LeadScore} num={lead.score_numeric} />}
          <div className="flex items-center gap-1 text-xs font-medium whitespace-nowrap">
            <Clock className="size-3" />
            {new Date(a.starts_at).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyLeadCard({ lead: l }: { lead: Record<string, unknown> }) {
  const navigate = useNavigate();
  const open = () => navigate({ to: "/leads/$leadId", params: { leadId: l.id as string } });
  const summary = (l.ai_summary as string | null) ?? (l.qualification_summary as string | null);

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Lead ${(l.name as string | null) ?? "Anonymer Besucher"} öffnen`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="rounded-2xl border border-dashed border-border bg-card p-5 hover:bg-accent/40 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{(l.name as string | null) ?? "Anonymer Besucher"}</span>
            <IntentChip intent={l.intent as LeadIntent} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {(l.email as string | null) ?? (l.phone as string | null) ?? "—"}
          </div>
          {summary && (
            <p className="mt-2 text-sm text-foreground leading-relaxed line-clamp-2">{summary}</p>
          )}
        </div>
        <div className="flex sm:flex-col items-start sm:items-end gap-2 shrink-0">
          <ScorePill score={l.score as LeadScore} num={l.score_numeric as number} />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Zuletzt aktualisiert {formatDate(l.updated_at as string)}
          </span>
        </div>
      </div>
    </div>
  );
}
