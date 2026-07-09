import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock } from "lucide-react";
import { IntentChip, ScorePill, formatDate, type Lead } from "./dashboard";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments – EstateAI" }] }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("companies").select("id, name, greeting").eq("owner_id", user.id).maybeSingle();
      return data;
    },
  });

  const leadsQuery = useQuery({
    queryKey: ["leads", companyQuery.data?.id],
    queryFn: async () => {
      if (!companyQuery.data) return [];
      const { data } = await supabase
        .from("leads").select("*").eq("company_id", companyQuery.data.id).order("created_at", { ascending: false });
      return (data ?? []) as unknown as Lead[];
    },
    enabled: !!companyQuery.data,
  });

  const appointments = (leadsQuery.data ?? [])
    .filter((l) => l.status === "termin")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const loading = companyQuery.isLoading || leadsQuery.isLoading;

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Appointments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {appointments.length > 0
          ? `${appointments.length} vereinbarte${appointments.length === 1 ? "r Termin" : " Termine"}.`
          : "Vereinbarte Termine mit Ihren Leads."}
      </p>

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Lade…</div>
      ) : appointments.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
          <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
            <Calendar className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
            Noch keine vereinbarten Termine. Sobald ein Lead als Termin vereinbart markiert wird, erscheint er hier.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {appointments.map((l) => (
            <AppointmentCard key={l.id} lead={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ lead: l }: { lead: Lead }) {
  const navigate = useNavigate();
  const open = () => navigate({ to: "/leads/$leadId", params: { leadId: l.id } });
  const summary = l.ai_summary ?? l.qualification_summary;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Lead ${l.name ?? "Anonymer Besucher"} öffnen`}
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
            <span className="font-medium">{l.name ?? "Anonymer Besucher"}</span>
            <IntentChip intent={l.intent} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{l.email ?? l.phone ?? "—"}</div>
          {(l.property_type ?? l.object_desc) && (
            <div className="mt-1 text-sm text-muted-foreground">{l.property_type ?? l.object_desc}</div>
          )}
          {summary && <p className="mt-2 text-sm text-foreground leading-relaxed line-clamp-2">{summary}</p>}
        </div>
        <div className="flex sm:flex-col items-start sm:items-end gap-2 shrink-0">
          <ScorePill score={l.score} num={l.score_numeric} />
          <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="size-3" /> Zuletzt aktualisiert {formatDate(l.updated_at)}
          </div>
        </div>
      </div>
    </div>
  );
}
