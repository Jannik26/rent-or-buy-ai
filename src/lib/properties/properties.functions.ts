// Central properties data layer (Product Track slice 9) — every properties
// read/write in the app goes through these server functions, never a
// scattered direct Supabase call from a component. Follows the same
// createServerFn + requireSupabaseAuth pattern as
// src/lib/appointments/appointments.functions.ts: `context.supabase` is
// bound to the caller's own JWT (RLS-enforced, never service role), so
// tenant isolation is enforced by Postgres itself (see the migration's
// tg_set_property_company trigger + RLS policies), never by trusting a
// client-supplied company_id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  archivePropertySchema,
  buildPropertyInsertPayload,
  buildPropertyUpdatePayload,
  createPropertySchema,
  updatePropertySchema,
  type PropertyMarketingType,
  type PropertyStatus,
  type PropertyTypeValue,
} from "@/lib/properties/property-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PropertyRow = {
  id: string;
  company_id: string;
  title: string;
  status: PropertyStatus;
  marketing_type: PropertyMarketingType;
  price: number | null;
  currency: string;
  property_type: PropertyTypeValue;
  street: string | null;
  house_number: string | null;
  postal_code: string;
  city: string;
  district: string | null;
  country: string;
  living_area_m2: number | null;
  plot_area_m2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  has_balcony: boolean;
  has_terrace: boolean;
  has_garden: boolean;
  has_parking: boolean;
  has_elevator: boolean;
  has_fitted_kitchen: boolean;
  is_accessible: boolean;
  description: string | null;
  external_reference: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Every property belonging to the caller's own company (RLS-scoped —
 * a foreign company's rows simply never appear, never need an explicit
 * company_id filter). Newest first, matching the properties_company_created_idx
 * index. Excludes nothing by default — the list page itself decides whether
 * to show archived properties (status is a plain column it can filter on
 * client-side, same convention as the Leads list's search/filter). */
export const getCompanyProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PropertyRow[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PropertyRow[];
  });

export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ propertyId: z.string().regex(UUID_RE) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PropertyRow | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as PropertyRow | null) ?? null;
  });

/** company_id is never passed here — it's derived server-side by the
 * `properties_set_company` trigger from the authenticated caller's own
 * company (see the migration), exactly matching the RLS INSERT policy so a
 * client can never create a property for a foreign tenant. Looked up here
 * too (not only left to the trigger) — same defense-in-depth precedent as
 * createAppointment's `lead.company_id` lookup: a clear "kein Unternehmen
 * gefunden" error before the insert is attempted, and the
 * `properties_set_company` trigger still re-derives/overwrites it
 * independently either way, so a caller can never smuggle a different
 * value through even if this lookup were ever bypassed. */
export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createPropertySchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyRow> => {
    const { supabase, userId } = context;
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (companyErr) throw new Error(companyErr.message);
    if (!company) throw new Error("Kein Unternehmen für diesen Nutzer gefunden.");

    const payload = buildPropertyInsertPayload(data);
    const { data: created, error } = await supabase
      .from("properties")
      .insert({ ...payload, company_id: company.id })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created as PropertyRow;
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updatePropertySchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyRow> => {
    const { supabase } = context;
    const { propertyId, ...rest } = data;
    const patch = buildPropertyUpdatePayload(rest);
    if (Object.keys(patch).length === 0) throw new Error("Keine Änderungen übergeben.");
    const { data: updated, error } = await supabase
      .from("properties")
      .update(patch)
      .eq("id", propertyId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Immobilie nicht gefunden.");
    return updated as PropertyRow;
  });

/** "archivieren" per task instructions — sets status='archived' rather than
 * deleting the row, so historical matches/analytics referencing this
 * property later never hit a dangling reference. A real hard-delete isn't
 * exposed in this V1 (mirrors appointments' cancel-not-delete philosophy:
 * DELETE stays possible at the RLS layer for a future explicit "endgültig
 * löschen" action, but no UI path calls it yet). */
export const archiveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => archivePropertySchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyRow> => {
    const { supabase } = context;
    const { data: updated, error } = await supabase
      .from("properties")
      .update({ status: "archived" })
      .eq("id", data.propertyId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Immobilie nicht gefunden.");
    return updated as PropertyRow;
  });
