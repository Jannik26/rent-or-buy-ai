// Pure, unit-tested rules for the appointments feature — no Supabase I/O
// here (that lives in appointments.functions.ts). Mirrors the pattern in
// src/lib/billing/subscription-status.ts: validation and status-mapping
// decisions are plain functions/schemas so they can be tested without a
// database.
import { z } from "zod";

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidIsoDate(value: string): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

const startsAtField = z
  .string()
  .refine(isValidIsoDate, { message: "Bitte ein gültiges Datum und eine Uhrzeit angeben." });

const optionalEndsAtField = z
  .string()
  .refine(isValidIsoDate, { message: "Bitte ein gültiges Enddatum angeben." })
  .nullable()
  .optional();

const locationField = z.string().trim().max(200, "Maximal 200 Zeichen.").nullable().optional();

const notesField = z.string().trim().max(2000, "Maximal 2000 Zeichen.").nullable().optional();

function endsAfterStarts(v: { startsAt: string; endsAt?: string | null }): boolean {
  if (!v.endsAt) return true;
  return new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime();
}

export const createAppointmentSchema = z
  .object({
    leadId: z.string().regex(UUID_RE, "Ungültige Lead-ID."),
    startsAt: startsAtField,
    endsAt: optionalEndsAtField,
    location: locationField,
    notes: notesField,
  })
  .refine(endsAfterStarts, { message: "Das Ende muss nach dem Start liegen.", path: ["endsAt"] });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z
  .object({
    appointmentId: z.string().regex(UUID_RE, "Ungültige Termin-ID."),
    startsAt: startsAtField.optional(),
    endsAt: optionalEndsAtField,
    location: locationField,
    notes: notesField,
  })
  .refine((v) => !v.startsAt || endsAfterStarts({ startsAt: v.startsAt, endsAt: v.endsAt }), {
    message: "Das Ende muss nach dem Start liegen.",
    path: ["endsAt"],
  });

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().regex(UUID_RE, "Ungültige Termin-ID."),
  // Captured client-side from the lead's status right before the cancelling
  // click, exactly like the old toggleTermin()'s `previous` closure — lets
  // the toast's "Rückgängig" action restore precisely that value instead of
  // an unconditional "neu". Falls back to LEAD_STATUS_ON_CANCEL_FALLBACK
  // server-side if omitted, which matches the old button's own behavior.
  revertLeadStatusTo: z.string().min(1).max(50).optional(),
});

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const restoreAppointmentSchema = z.object({
  appointmentId: z.string().regex(UUID_RE, "Ungültige Termin-ID."),
});

export type RestoreAppointmentInput = z.infer<typeof restoreAppointmentSchema>;

/** Lead status written when a new appointment is scheduled. Mirrors the
 * pre-existing toggle in leads/$leadId.tsx, which always set "termin"
 * regardless of the lead's prior status. */
export const LEAD_STATUS_ON_SCHEDULE = "termin";

/** Lead status fallback when an appointment is cancelled without a captured
 * prior status to restore. Matches the old toggle's un-terminate branch,
 * which always went to "neu" — never back through an intermediate state
 * like "qualifiziert". Kept identical on purpose to avoid changing existing
 * dashboard/conversion-rate behavior for that transition. */
export const LEAD_STATUS_ON_CANCEL_FALLBACK = "neu";

/** Postgres unique-violation error code (23505) for the
 * `appointments_one_scheduled_per_lead` partial index — used by the server
 * layer to turn a constraint violation into a clear German error instead of
 * a raw Postgres message. */
export const UNIQUE_VIOLATION_CODE = "23505";

// ---- Local-time <-> stored-UTC-ISO conversion for the date/time form ----
// Same pattern already used by company-edit-dialog.tsx's
// toLocalInputValue/fromLocalInputValue, extracted here as pure, tested
// functions since the appointments form needs the identical conversion.

/** Converts a stored UTC ISO timestamp to the value a native
 * `<input type="datetime-local">` expects, rendered in the browser's local
 * timezone — never UTC — so the form always shows local time correctly. */
export function isoToDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a `<input type="datetime-local">` value (local time, no
 * timezone offset) back to a UTC ISO timestamp for storage. Returns null
 * for an empty or unparseable value instead of throwing, so callers can
 * treat it the same way as any other missing-input case. */
export function dateTimeLocalValueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
