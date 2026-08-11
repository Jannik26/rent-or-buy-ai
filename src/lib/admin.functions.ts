import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminCompanyOverviewRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
  subscription_status: string | null;
  plan: string | null;
  demo_started_at: string | null;
  demo_expires_at: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  admin_notes: string | null;
  lead_count: number;
  message_count: number;
  last_activity: string | null;
};

const EDITABLE_COLUMNS =
  "subscription_status, plan, demo_started_at, demo_expires_at, subscription_started_at, subscription_expires_at, admin_notes";

/** Exported so other admin-only server-function modules (e.g.
 * feedback/admin-feedback.functions.ts) can reuse the exact same
 * super_admin gate instead of re-implementing it — one check, one place. */
export async function requireSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isSuperAdmin, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error || !isSuperAdmin) {
    throw new Response("Forbidden – Super-Admin-Rolle erforderlich.", { status: 403 });
  }
  return supabaseAdmin;
}

export const checkSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isSuperAdmin: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    return { isSuperAdmin: !error && Boolean(data) };
  });

export const adminListCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCompanyOverviewRow[]> => {
    const supabaseAdmin = await requireSuperAdmin(context.userId);
    const { data, error } = await supabaseAdmin.rpc("admin_company_overview");
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminCompanyOverviewRow[];
  });

const adminUpdateCompanySchema = z
  .object({
    companyId: z.string().regex(UUID_RE),
    action: z.string().min(1).max(120),
    // Not `.nullable()`, unlike the other fields below: companies.subscription_status
    // has been NOT NULL (default 'trial') since the subscription_data_hardening
    // migration — the generated Supabase types now correctly reject `null` here.
    // Omit the field entirely (still `.optional()`) to leave it unchanged.
    subscription_status: z.enum(["trial", "active", "expired", "paused", "cancelled"]).optional(),
    plan: z.enum(["basic", "professional", "enterprise"]).nullable().optional(),
    demo_started_at: z.string().datetime().nullable().optional(),
    demo_expires_at: z.string().datetime().nullable().optional(),
    subscription_started_at: z.string().datetime().nullable().optional(),
    subscription_expires_at: z.string().datetime().nullable().optional(),
    admin_notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type AdminUpdateCompanyInput = z.infer<typeof adminUpdateCompanySchema>;

export const adminUpdateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminUpdateCompanySchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireSuperAdmin(context.userId);

    const { companyId, action, ...rest } = data;

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("companies")
      .select(EDITABLE_COLUMNS)
      .eq("id", companyId)
      .maybeSingle();
    if (beforeErr) throw new Error(beforeErr.message);
    if (!before) throw new Error("Unternehmen nicht gefunden.");

    const { data: after, error: updateErr } = await supabaseAdmin
      .from("companies")
      .update(rest)
      .eq("id", companyId)
      .select(EDITABLE_COLUMNS)
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    if (!after) throw new Error("Speichern fehlgeschlagen – Unternehmen nicht gefunden.");

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      company_id: companyId,
      action,
      previous_values: before,
      new_values: after,
    });

    return after;
  });
