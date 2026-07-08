import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, X } from "lucide-react";
import type { Lead } from "../dashboard";
import { IntentChip, ScoreBar, StatusBadge } from "../dashboard";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads – EstateAI" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const filter = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("filter") : null;

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
  const leads = leadsQuery.data ?? [];

  const filtered = useMemo(() => {
    let result = leads;
    if (filter === "new") {
      const now = Date.now();
      result = result.filter((l) => now - new Date(l.created_at).getTime() < 7 * 864e5);
    } else if (filter === "hot") {
      result = result.filter((l) => l.score === "hot");
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter((l) =>
      (l.name ?? "").toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.location ?? "").toLowerCase().includes(q),
    );
  }, [leads, search, filter]);

  const filterLabel = filter === "new" ? "Neue Leads (letzte 7 Tage)" : filter === "hot" ? "Heiße Leads" : null;

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Leads</h1>
      <p className="mt-1 text-sm text-muted-foreground">{leads.length} {leads.length === 1 ? "Lead" : "Leads"} insgesamt</p>

      <div className="mt-6 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 max-w-md shadow-soft">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Leads durchsuchen…"
          className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
        />
      </div>

      {filterLabel && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Filter: {filterLabel}
          <Link to="/leads" className="inline-flex items-center gap-0.5 hover:text-foreground">
            <X className="size-3" /> Zurücksetzen
          </Link>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Noch keine Leads vorhanden.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                  <th className="text-left font-semibold px-6 py-3">Kunde</th>
                  <th className="text-left font-semibold px-4 py-3">Typ</th>
                  <th className="text-left font-semibold px-4 py-3 w-[200px]">KI-Score</th>
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    role="link"
                    tabIndex={0}
                    aria-label={`Lead ${l.name ?? "Anonymer Besucher"} öffnen`}
                    onClick={() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate({ to: "/leads/$leadId", params: { leadId: l.id } });
                      }
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium">{l.name ?? "Anonymer Besucher"}</div>
                      <div className="text-xs text-muted-foreground">{l.email ?? l.phone ?? "—"}</div>
                    </td>
                    <td className="px-4 py-4"><IntentChip intent={l.intent} /></td>
                    <td className="px-4 py-4"><ScoreBar score={l.score} num={l.score_numeric} /></td>
                    <td className="px-4 py-4"><StatusBadge status={l.status} score={l.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
