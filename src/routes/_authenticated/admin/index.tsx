import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronLeft, ChevronRight, Search, Shield } from "lucide-react";
import {
  checkSuperAdmin,
  adminListCompanies,
  type AdminCompanyOverviewRow,
} from "@/lib/admin.functions";
import {
  SubscriptionStatusBadge,
  TrialActiveBadge,
  PLAN_LABELS,
} from "@/components/admin/subscription-badge";
import { CompanyEditDialog } from "@/components/admin/company-edit-dialog";
import { formatDate } from "../dashboard";

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["all", "trial", "active", "expired", "paused", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type SortKey = "name" | "created_at" | "lead_count" | "last_activity";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin – EstateAI" }] }),
  beforeLoad: async () => {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  const fetchCompanies = useServerFn(adminListCompanies);
  const companiesQuery = useQuery({
    queryKey: ["admin", "companies"],
    queryFn: () => fetchCompanies(),
  });
  const companies = companiesQuery.data ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AdminCompanyOverviewRow | null>(null);

  const filtered = useMemo(() => {
    let result = companies;
    if (statusFilter !== "all") {
      result = result.filter((c) => c.subscription_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.contact_name ?? "").toLowerCase().includes(q) ||
          (c.contact_email ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "created_at") cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === "lead_count") cmp = a.lead_count - b.lead_count;
      else if (sortKey === "last_activity")
        cmp = (a.last_activity ?? "").localeCompare(b.last_activity ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [companies, search, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield className="size-6 text-primary" />
          <h1 className="font-display text-2xl sm:text-3xl">Admin – Unternehmen</h1>
        </div>
        <Link
          to="/admin/feedback"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          Feedback (alle Unternehmen) <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered.length} von {companies.length}{" "}
        {companies.length === 1 ? "Unternehmen" : "Unternehmen"}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 max-w-md flex-1 shadow-soft">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Firma, Ansprechpartner oder E-Mail durchsuchen…"
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(0);
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">Alle Status</option>
          <option value="trial">Testphase</option>
          <option value="active">Aktiv</option>
          <option value="expired">Abgelaufen</option>
          <option value="paused">Pausiert</option>
          <option value="cancelled">Gekündigt</option>
        </select>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        {companiesQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Lädt…</div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Keine Unternehmen gefunden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                  <SortableHeader
                    label="Firma"
                    sortKey="name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="text-left font-semibold px-4 py-3">Ansprechpartner</th>
                  <th className="text-left font-semibold px-4 py-3">E-Mail</th>
                  <SortableHeader
                    label="Erstellt"
                    sortKey="created_at"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                  <th className="text-left font-semibold px-4 py-3">Testphase</th>
                  <th className="text-left font-semibold px-4 py-3">Tarif</th>
                  <SortableHeader
                    label="Leads"
                    sortKey="lead_count"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="text-left font-semibold px-4 py-3">Nachrichten</th>
                  <SortableHeader
                    label="Letzte Aktivität"
                    sortKey="last_activity"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="text-left font-semibold px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition"
                  >
                    <td className="px-6 py-4 font-medium">{c.name}</td>
                    <td className="px-4 py-4 text-muted-foreground">{c.contact_name ?? "—"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{c.contact_email ?? "—"}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <SubscriptionStatusBadge status={c.subscription_status} />
                    </td>
                    <td className="px-4 py-4">
                      <TrialActiveBadge
                        subscriptionStatus={c.subscription_status}
                        demoExpiresAt={c.demo_expires_at}
                      />
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {c.plan ? (PLAN_LABELS[c.plan] ?? c.plan) : "—"}
                    </td>
                    <td className="px-4 py-4 tabular-nums">{c.lead_count}</td>
                    <td className="px-4 py-4 tabular-nums">{c.message_count}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {c.last_activity ? formatDate(c.last_activity) : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => setEditing(c)}
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        Verwalten
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Seite {currentPage + 1} von {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-lg border border-border bg-card p-1.5 hover:bg-accent disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded-lg border border-border bg-card p-1.5 hover:bg-accent disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      <CompanyEditDialog
        company={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onUpdated={() => {
          setEditing(null);
          void companiesQuery.refetch();
        }}
      />
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th className="text-left font-semibold px-4 py-3">
      <button
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active && <span>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
