// Central appointments data layer — every appointments read/write in the app
// goes through these server functions instead of scattered direct Supabase
// calls in components (unlike the older leads.status toggle, which called
// supabase.from("leads").update(...) straight from the component). Follows
// the same createServerFn + requireSupabaseAuth pattern already used by
// lead-summary.functions.ts and admin.functions.ts: `context.supabase` is
// bound to the caller's own JWT (RLS-enforced, NOT service role), so tenant
// isolation is enforced by Postgres itself, never by trusting a
// client-supplied company_id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LEAD_STATUS_ON_CANCEL_FALLBACK,
  LEAD_STATUS_ON_SCHEDULE,
  UNIQUE_VIOLATION_CODE,
  cancelAppointmentSchema,
  createAppointmentSchema,
  restoreAppointmentSchema,
  updateAppointmentSchema,
} from "@/lib/appointments/appointment-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEAD_CARD_FIELDS =
  "id, name, email, phone, intent, property_type, object_desc, ai_summary, qualification_summary, score, score_numeric";

export type AppointmentRow = {
  id: string;
  company_id: string;
  lead_id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Concrete (not Record<string, unknown>) so createServerFn's serializability
// check can verify it — matches exactly the columns in LEAD_CARD_FIELDS.
export type LeadCardInfo = {
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
};

/** A lead's full appointment history, most recent first. */
export const getLeadAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }): Promise<AppointmentRow[]> => {
    const { supabase } = context;
    // No explicit ownership check needed beyond RLS: a foreign lead_id
    // simply yields zero rows here (RLS "Owner reads appointments").
    const { data: rows, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Everything the /appointments overview page needs: all currently scheduled
 * appointments (with the lead fields the card displays), plus — so nothing
 * silently disappears — leads whose status is already "termin" (set either
 * by the dashboard toggle before this feature existed, or directly by the
 * AI chat, see widget.chat.ts ALLOWED_STATUS) but that have no scheduled
 * appointment row yet, i.e. no known date.
 */
export const getCompanyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      appointments: (AppointmentRow & { lead: LeadCardInfo | null })[];
      legacyLeadsWithoutDate: (LeadCardInfo & { updated_at: string })[];
    }> => {
      const { supabase, userId } = context;

      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      if (companyErr) throw new Error(companyErr.message);
      if (!company) return { appointments: [], legacyLeadsWithoutDate: [] };

      const { data: appointments, error: apptErr } = await supabase
        .from("appointments")
        .select(`*, lead:leads(${LEAD_CARD_FIELDS})`)
        .eq("company_id", company.id)
        .eq("status", "scheduled")
        .order("starts_at", { ascending: true });
      if (apptErr) throw new Error(apptErr.message);

      const scheduledLeadIds = new Set((appointments ?? []).map((a) => a.lead_id));
      const { data: terminLeads, error: leadsErr } = await supabase
        .from("leads")
        .select(`${LEAD_CARD_FIELDS}, updated_at`)
        .eq("company_id", company.id)
        .eq("status", "termin");
      if (leadsErr) throw new Error(leadsErr.message);
      const legacyLeadsWithoutDate = (terminLeads ?? []).filter(
        (l) => !scheduledLeadIds.has(l.id),
      ) as (LeadCardInfo & { updated_at: string })[];

      return {
        appointments: (appointments ?? []) as unknown as (AppointmentRow & {
          lead: LeadCardInfo | null;
        })[],
        legacyLeadsWithoutDate,
      };
    },
  );

/**
 * Schedules a new appointment for a lead and marks the lead as "termin" —
 * mirrors the old toggleTermin()'s "schedule" branch, now backed by a real
 * date instead of only a status flag. `company_id` is looked up here and
 * also re-derived/overwritten server-side by the appointments_set_company
 * trigger (defense in depth, see the migration) — never trusted as
 * client input either way.
 */
export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, status, company_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead nicht gefunden.");

    const { data: appointment, error: insertErr } = await supabase
      .from("appointments")
      .insert({
        company_id: lead.company_id,
        lead_id: data.leadId,
        starts_at: data.startsAt,
        ends_at: data.endsAt ?? null,
        location: data.location ?? null,
        notes: data.notes ?? null,
      })
      .select("*")
      .single();
    if (insertErr) {
      if (insertErr.code === UNIQUE_VIOLATION_CODE) {
        throw new Error("Für diesen Lead ist bereits ein Termin geplant.");
      }
      throw new Error(insertErr.message);
    }

    const { error: statusErr } = await supabase
      .from("leads")
      .update({ status: LEAD_STATUS_ON_SCHEDULE })
      .eq("id", data.leadId);
    if (statusErr) throw new Error(statusErr.message);

    return { appointment: appointment as AppointmentRow, previousLeadStatus: lead.status };
  });

/** Edits date/time, location or notes of an existing (typically still
 * scheduled) appointment. Status changes go through cancelAppointment /
 * restoreAppointment instead, so this never touches leads.status. */
export const updateAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      starts_at?: string;
      ends_at?: string | null;
      location?: string | null;
      notes?: string | null;
    } = {};
    if (data.startsAt !== undefined) patch.starts_at = data.startsAt;
    if (data.endsAt !== undefined) patch.ends_at = data.endsAt ?? null;
    if (data.location !== undefined) patch.location = data.location ?? null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (Object.keys(patch).length === 0) throw new Error("Keine Änderungen übergeben.");

    const { data: updated, error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", data.appointmentId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Termin nicht gefunden.");
    return updated as AppointmentRow;
  });

/**
 * Cancels an appointment (kept as history, not deleted — see the migration
 * for why: future analytics needs completed/cancelled counts) and reverts
 * the lead's status. Mirrors the old toggle's "un-terminate" branch, which
 * always fell back to "neu" — `revertLeadStatusTo` (the status captured
 * client-side right before the cancelling click) reproduces the exact
 * per-click reversal the old toast's "Rückgängig" action already did.
 */
export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: appointment, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", data.appointmentId)
      .select("id, lead_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!appointment) throw new Error("Termin nicht gefunden.");

    const nextStatus = data.revertLeadStatusTo ?? LEAD_STATUS_ON_CANCEL_FALLBACK;
    const { error: statusErr } = await supabase
      .from("leads")
      .update({ status: nextStatus })
      .eq("id", appointment.lead_id);
    if (statusErr) throw new Error(statusErr.message);

    return { appointmentId: appointment.id, leadId: appointment.lead_id, leadStatus: nextStatus };
  });

/** Undoes a cancellation (the toast's "Rückgängig" action after a "Termin
 * zurücknehmen" click): re-activates the same appointment row and restores
 * leads.status to "termin". Fails with a clear message if another
 * appointment was scheduled for the same lead in the meantime (the
 * appointments_one_scheduled_per_lead unique index). */
export const restoreAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restoreAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: appointment, error } = await supabase
      .from("appointments")
      .update({ status: "scheduled" })
      .eq("id", data.appointmentId)
      .select("id, lead_id")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION_CODE) {
        throw new Error("Für diesen Lead ist inzwischen bereits ein anderer Termin aktiv.");
      }
      throw new Error(error.message);
    }
    if (!appointment) throw new Error("Termin nicht gefunden.");

    const { error: statusErr } = await supabase
      .from("leads")
      .update({ status: LEAD_STATUS_ON_SCHEDULE })
      .eq("id", appointment.lead_id);
    if (statusErr) throw new Error(statusErr.message);

    return { appointmentId: appointment.id, leadId: appointment.lead_id };
  });

const setLeadStatusSchema = z.object({
  leadId: z.string().regex(UUID_RE),
  status: z.string().min(1).max(50),
});

/**
 * Directly sets a lead's status without touching the appointments table.
 * Only used for the "legacy" shape this migration deliberately does not
 * backfill: a lead with status = 'termin' (set by the AI chat or the old
 * toggle) that has no scheduled appointment row, i.e. no known date yet.
 * "Termin zurücknehmen" on such a lead has nothing to cancel, and "Rückgängig"
 * on that action has nothing to restore — both just flip the plain status
 * flag, symmetric to each other.
 */
export const setLegacyLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setLeadStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { leadId: data.leadId, leadStatus: data.status };
  });
