// Cross-tenant Feedback overview for super_admin only (Product Track
// slice 10, task Abschnitt 8/14/17 — the "AI Product Manager" foundation
// starts here: this is the read path a future aggregate-trends feature
// would build on, not that feature itself).
//
// Reuses the EXACT same secure gate every other cross-tenant admin read
// in this app already uses (requireSuperAdmin, admin.functions.ts) —
// deliberately not a new role/permission concept. Per task Abschnitt 14:
// "wenn dafür aktuell keine sichere interne Rolle existiert: nicht
// improvisieren" — one already exists (super_admin + has_role()), so this
// reuses it rather than inventing a second admin concept.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/lib/admin.functions";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
} from "@/lib/feedback/feedback-rules";
import type { FeedbackItemWithAnalysis } from "@/lib/feedback/feedback.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminFeedbackRow = FeedbackItemWithAnalysis & { company_name: string };

/** Every feedback item across every tenant, joined to the company name —
 * only ever reachable by a real super_admin (requireSuperAdmin throws
 * 403 otherwise, exactly like adminListCompanies). Uses the service-role
 * client, which the feedback_items_with_latest_analysis view's
 * security_invoker setting correctly lets bypass RLS end-to-end (see the
 * migration's comment) — same trust boundary as every other admin read in
 * this app, not a new one. */
export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminFeedbackRow[]> => {
    const supabaseAdmin = await requireSuperAdmin(context.userId);

    const { data: items, error } = await supabaseAdmin
      .from("feedback_items_with_latest_analysis")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: companies, error: companiesErr } = await supabaseAdmin
      .from("companies")
      .select("id, name");
    if (companiesErr) throw new Error(companiesErr.message);
    const nameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

    return (items ?? []).map((item) => ({
      ...(item as FeedbackItemWithAnalysis),
      company_name: nameById.get(item.company_id as string) ?? "Unbekanntes Unternehmen",
    }));
  });

const adminUpdateFeedbackSchema = z
  .object({
    feedbackItemId: z.string().regex(UUID_RE),
    status: z.enum(FEEDBACK_STATUSES).optional(),
    categoryOverride: z.enum(FEEDBACK_CATEGORIES).nullable().optional(),
    priorityOverride: z.enum(FEEDBACK_PRIORITIES).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.categoryOverride !== undefined ||
      v.priorityOverride !== undefined,
    { message: "Mindestens eine Änderung angeben." },
  );

/** Human review (task Abschnitt 13) from the CROSS-TENANT admin view —
 * the tenant-owner-scoped updateFeedbackStatus/overrideFeedbackAnalysis
 * in feedback.functions.ts only work for a company's own owner (correctly
 * RLS-blocked otherwise), so a super_admin reviewing a *different*
 * tenant's feedback needs this separate, explicitly gated path — same
 * service-role + audit-log discipline as adminUpdateCompany, not a new
 * pattern. Writes only feedback_items' human-owned columns, never
 * feedback_analyses (which stays append-only regardless of caller). */
export const adminUpdateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminUpdateFeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireSuperAdmin(context.userId);
    const { feedbackItemId, ...rest } = data;

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("feedback_items")
      .select("status, category_override, priority_override")
      .eq("id", feedbackItemId)
      .maybeSingle();
    if (beforeErr) throw new Error(beforeErr.message);
    if (!before) throw new Error("Feedback nicht gefunden.");

    const patch: {
      reviewed_by: string;
      reviewed_at: string;
      status?: string;
      category_override?: string | null;
      priority_override?: string | null;
    } = {
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (rest.status !== undefined) patch.status = rest.status;
    if (rest.categoryOverride !== undefined) patch.category_override = rest.categoryOverride;
    if (rest.priorityOverride !== undefined) patch.priority_override = rest.priorityOverride;

    const { data: after, error: updateErr } = await supabaseAdmin
      .from("feedback_items")
      .update(patch)
      .eq("id", feedbackItemId)
      .select("status, category_override, priority_override, company_id")
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    if (!after) throw new Error("Speichern fehlgeschlagen.");

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      company_id: after.company_id,
      action: "feedback_review",
      previous_values: before,
      new_values: {
        status: after.status,
        category_override: after.category_override,
        priority_override: after.priority_override,
      },
    });

    return after;
  });
