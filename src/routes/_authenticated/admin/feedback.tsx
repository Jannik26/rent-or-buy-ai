import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { checkSuperAdmin } from "@/lib/admin.functions";
import {
  adminListFeedback,
  adminUpdateFeedback,
  type AdminFeedbackRow,
} from "@/lib/feedback/admin-feedback.functions";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUSES,
  resolveEffectiveCategory,
  resolveEffectivePriority,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/feedback/feedback-rules";
import { formatDate } from "../dashboard";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  head: () => ({ meta: [{ title: "Feedback (Admin) – EstateAI" }] }),
  beforeLoad: async () => {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminFeedbackPage,
});

const CATEGORY_FILTERS = ["all", ...FEEDBACK_CATEGORIES] as const;
const STATUS_FILTERS = ["all", ...FEEDBACK_STATUSES] as const;

function AdminFeedbackPage() {
  const qc = useQueryClient();
  const fetchFeedback = useServerFn(adminListFeedback);
  const updateFn = useServerFn(adminUpdateFeedback);
  const query = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => fetchFeedback() });
  const items = query.data ?? [];

  async function handleUpdate(
    feedbackItemId: string,
    patch: {
      status?: FeedbackStatus;
      categoryOverride?: FeedbackCategory | null;
      priorityOverride?: FeedbackPriority | null;
    },
  ) {
    try {
      await updateFn({ data: { feedbackItemId, ...patch } });
      qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
      toast.success("Gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  }

  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORY_FILTERS)[number]>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  // No useMemo — a demo-scale feedback list is small, a plain filter on
  // every render is cheaper than the memoization bookkeeping (same call
  // as properties/index.tsx's list filter).
  const filtered = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (categoryFilter !== "all") {
      const category = resolveEffectiveCategory({
        category_override: item.category_override,
        ai_category: item.ai_category,
      });
      if (category.value !== categoryFilter) return false;
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto w-full">
      <Link
        to="/admin"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <ArrowLeft className="size-4" /> Admin
      </Link>
      <h1 className="font-display text-2xl sm:text-3xl mt-3">Feedback (alle Unternehmen)</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length} Feedback-Einträge über alle Mandanten hinweg — nur für Super-Admins sichtbar.
      </p>

      <div className="mt-6 flex items-center gap-4 flex-wrap">
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={STATUS_FILTERS}
          labels={{ all: "Alle", ...FEEDBACK_STATUS_LABEL }}
          onChange={setStatusFilter}
        />
        <FilterGroup
          label="Kategorie"
          value={categoryFilter}
          options={CATEGORY_FILTERS}
          labels={{ all: "Alle", ...FEEDBACK_CATEGORY_LABEL }}
          onChange={setCategoryFilter}
        />
      </div>

      {query.isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Lade…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Keine Feedback-Einträge mit diesen Filtern.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Feedback</th>
                <th className="px-4 py-3">Unternehmen</th>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Kategorie</th>
                <th className="px-4 py-3">Priorität</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <AdminFeedbackRowView key={item.id} item={item} onUpdate={handleUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const selectCls =
  "rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring cursor-pointer";

function AdminFeedbackRowView({
  item,
  onUpdate,
}: {
  item: AdminFeedbackRow;
  onUpdate: (
    feedbackItemId: string,
    patch: {
      status?: FeedbackStatus;
      categoryOverride?: FeedbackCategory | null;
      priorityOverride?: FeedbackPriority | null;
    },
  ) => void;
}) {
  const category = resolveEffectiveCategory({
    category_override: item.category_override,
    ai_category: item.ai_category,
  });
  const priority = resolveEffectivePriority({
    priority_override: item.priority_override,
    ai_suggested_priority: item.ai_suggested_priority,
  });
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3 max-w-md">
        <div className="line-clamp-2">{item.raw_content}</div>
        {item.ai_summary && (
          <div className="mt-1 text-xs text-info" title="KI-Zusammenfassung">
            KI: {item.ai_summary}
          </div>
        )}
        {item.analysis_status === "pending" && (
          <div className="mt-1 text-xs text-muted-foreground">Analyse ausstehend…</div>
        )}
        {item.analysis_status === "failed" && (
          <div className="mt-1 text-xs text-destructive">Analyse fehlgeschlagen</div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{item.company_name}</td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {formatDate(item.created_at)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          {category.source === "ai" && (
            <span title="KI-Vorschlag — noch nicht von einem Menschen bestätigt">🤖</span>
          )}
          <select
            value={category.value ?? ""}
            title="Kategorie überschreiben (Human Override)"
            onChange={(e) =>
              onUpdate(item.id, {
                categoryOverride: (e.target.value || null) as FeedbackCategory | null,
              })
            }
            className={selectCls}
          >
            <option value="">—</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FEEDBACK_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          {priority.source === "ai" && (
            <span title="KI-Vorschlag, keine Produktentscheidung">🤖</span>
          )}
          <select
            value={priority.value ?? ""}
            title="Priorität überschreiben (Human Override) — 'Kritisch' ist ausschließlich hier wählbar, nie eine KI-Empfehlung"
            onChange={(e) =>
              onUpdate(item.id, {
                priorityOverride: (e.target.value || null) as FeedbackPriority | null,
              })
            }
            className={selectCls}
          >
            <option value="">—</option>
            {FEEDBACK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {FEEDBACK_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <select
          value={item.status}
          onChange={(e) => onUpdate(item.id, { status: e.target.value as FeedbackStatus })}
          className={selectCls}
        >
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FEEDBACK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={
            value === opt
              ? "rounded-full px-3 py-1.5 text-xs font-medium border bg-primary text-primary-foreground border-primary"
              : "rounded-full px-3 py-1.5 text-xs font-medium border bg-card text-muted-foreground border-border hover:bg-accent"
          }
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}
