// Server-function layer for Property Matching (Product Track slice 9) —
// the orchestration between the Lead Detail page and the pure
// lead-preferences.ts/matching-rules.ts modules. Same three-layer split
// already used elsewhere in this codebase (route/UI -> *.functions.ts ->
// pure rules), so the matching logic itself stays fully unit-testable
// without a database.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractLeadPreferences } from "@/lib/matching/lead-preferences";
import {
  rankPropertiesForLead,
  type MatchLeadToPropertiesResult,
} from "@/lib/matching/matching-rules";
import type { PropertyRow } from "@/lib/properties/properties.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getMatchesInput = z.object({ leadId: z.string().regex(UUID_RE) });

/**
 * Everything the Lead Detail page's "Passende Immobilien" section needs.
 * `company_id` is never taken from the client — the lead read below is
 * RLS-scoped to the caller's own company already (a foreign leadId simply
 * yields no row), and the properties read is separately RLS-scoped to the
 * same caller, so there is no path for a spoofed leadId to leak another
 * tenant's properties or vice versa — Postgres enforces both
 * independently, exactly like every other cross-table read in this app
 * (see getCompanyAppointments for the same discipline).
 */
export const getMatchesForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getMatchesInput.parse(input))
  .handler(async ({ data, context }): Promise<MatchLeadToPropertiesResult> => {
    const { supabase } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, intent, budget, property_type, object_desc, location")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    // A lead the caller can't see (foreign tenant, or a bad id) yields the
    // same honest "not applicable" outcome as a lead with no searchable
    // intent — never a different error path that could leak whether the
    // id exists at all.
    if (!lead) return { outcome: "not_applicable" };

    const { data: properties, error: propsErr } = await supabase.from("properties").select("*");
    if (propsErr) throw new Error(propsErr.message);

    const prefs = extractLeadPreferences({
      intent: lead.intent,
      budget: lead.budget,
      property_type: lead.property_type,
      object_desc: lead.object_desc,
      location: lead.location,
    });

    return rankPropertiesForLead(prefs, (properties ?? []) as PropertyRow[]);
  });
