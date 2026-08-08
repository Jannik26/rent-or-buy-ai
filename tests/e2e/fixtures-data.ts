// Deterministic E2E fixture data for the dedicated QA/E2E tenant.
//
// SECURITY: this module is imported ONLY from Playwright setup/teardown
// (Node.js test-runner processes, never bundled into the app). It uses the
// Supabase service role key to bypass RLS for fixture seeding/cleanup —
// exactly the kind of server-/test-only use CLAUDE.md's "service_role_key
// niemals ins Frontend" rule allows. The key itself is read from
// process.env (populated from the untracked local .env — see
// tests/e2e/README.md), never hardcoded, never logged.
//
// Every write here is scoped to fixed, clearly-tagged fixture IDs within
// the existing dedicated QA tenant (see QA_EMAIL/QA_COMPANY_ID below) —
// never a broad "delete everything for this company" operation, so a bug
// here cannot silently wipe real QA-tenant data even though today there
// isn't any.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Pre-existing, dedicated QA/E2E account and its auto-created company —
 * not created by this test suite (see ROADMAP.md/session history: created
 * once via the normal signup flow during manual E2E verification of the
 * Conversations slice, reused ever since to avoid Supabase's auth email
 * rate limit). Fixed, not a secret — an @example.com address that cannot
 * receive real mail. */
export const QA_EMAIL = "estateai.qa.review@example.com";
export const QA_COMPANY_ID = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";

/** Fixed fixture IDs, namespaced with an `e2e...` prefix so they never
 * collide with `gen_random_uuid()`-generated real rows and are
 * unambiguously greppable in the DB if something ever goes wrong. Kept
 * stable across runs (not regenerated per run) so setup is idempotent via
 * upsert-by-id and teardown is a simple delete-by-id. */
export const FIXTURE_IDS = {
  conversationLead: "e2e00001-0000-0000-0000-000000000001",
  appointmentLead: "e2e00001-0000-0000-0000-000000000002",
  appointment: "e2e00002-0000-0000-0000-000000000001",
} as const;

const CONVERSATION_LEAD_NAME = "E2E QA Fixture — Conversation Lead";
const APPOINTMENT_LEAD_NAME = "E2E QA Fixture — Appointment Lead";

export async function seedFixtures(admin: SupabaseClient): Promise<void> {
  const { error: leadsError } = await admin.from("leads").upsert(
    [
      {
        id: FIXTURE_IDS.conversationLead,
        company_id: QA_COMPANY_ID,
        name: CONVERSATION_LEAD_NAME,
        email: "e2e-conversation-fixture@example.com",
        phone: "+49 170 0000001",
        status: "qualifiziert",
        score: "hot",
        score_numeric: 75,
        intent: "kauf",
        property_type: "3-Zimmer-Wohnung",
        location: "Hamburg",
        messages: [
          { role: "assistant", content: "Hallo! Wie kann ich Ihnen helfen?" },
          { role: "user", content: "Ich suche eine 3-Zimmer-Wohnung in Hamburg." },
          { role: "assistant", content: "Gerne! In welchem Budget bewegen Sie sich?" },
          { role: "user", content: "Bis 450.000 Euro, Finanzierung ist vorhanden." },
        ],
      },
      {
        id: FIXTURE_IDS.appointmentLead,
        company_id: QA_COMPANY_ID,
        name: APPOINTMENT_LEAD_NAME,
        email: "e2e-appointment-fixture@example.com",
        status: "termin",
        score: "warm",
        score_numeric: 55,
        intent: "miete",
        messages: [
          { role: "assistant", content: "Hallo! Wie kann ich Ihnen helfen?" },
          { role: "user", content: "Ich hätte gerne einen Besichtigungstermin." },
        ],
      },
    ],
    { onConflict: "id" },
  );
  if (leadsError) throw new Error(`seedFixtures: leads upsert failed: ${leadsError.message}`);

  // starts_at intentionally in the future and re-computed relative to
  // "now" on every setup run, not a fixed past date — an appointment stuck
  // in the past would look wrong in the UI on every re-run.
  const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const { error: apptError } = await admin.from("appointments").upsert(
    [
      {
        id: FIXTURE_IDS.appointment,
        lead_id: FIXTURE_IDS.appointmentLead,
        company_id: QA_COMPANY_ID,
        starts_at: startsAt,
        status: "scheduled",
        location: "Musterstraße 1, 20095 Hamburg",
        notes: "E2E-Fixture — Besichtigungstermin",
      },
    ],
    { onConflict: "id" },
  );
  if (apptError) throw new Error(`seedFixtures: appointment upsert failed: ${apptError.message}`);

  // The appointment toggle in the lead detail page reads leads.status, not
  // just the appointments row — keep both in sync the same way the app's
  // own createAppointment server function does, so the UI starts in the
  // exact state a real "Termin vereinbart" lead would be in.
  const { error: statusError } = await admin
    .from("leads")
    .update({ status: "termin" })
    .eq("id", FIXTURE_IDS.appointmentLead);
  if (statusError) throw new Error(`seedFixtures: lead status sync failed: ${statusError.message}`);
}

export async function cleanupFixtures(admin: SupabaseClient): Promise<void> {
  // Order matters: appointments reference leads via FK (ON DELETE CASCADE
  // would handle it anyway, but deleting explicitly here is clearer about
  // intent and doesn't rely on cascade behavior staying unchanged).
  await admin.from("appointments").delete().eq("id", FIXTURE_IDS.appointment);
  await admin.from("leads").delete().eq("id", FIXTURE_IDS.conversationLead);
  await admin.from("leads").delete().eq("id", FIXTURE_IDS.appointmentLead);
}
