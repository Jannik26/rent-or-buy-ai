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
 * upsert-by-id and teardown is a simple delete-by-id.
 *
 * Messages themselves are NOT given fixed ids (see seedFixtures) — they're
 * deleted-and-reinserted by conversation_id on every setup run instead of
 * upserted, which sidesteps a real footgun: `messages.sequence` is always
 * (re-)computed server-side by a trigger on INSERT only (see the
 * conversations migration), so an upsert's UPDATE path would silently skip
 * re-deriving it — delete+insert avoids ever needing to reason about that. */
export const FIXTURE_IDS = {
  conversationLead: "e2e00001-0000-0000-0000-000000000001",
  appointmentLead: "e2e00001-0000-0000-0000-000000000002",
  appointment: "e2e00002-0000-0000-0000-000000000001",
  conversationLeadConversation: "e2e00003-0000-0000-0000-000000000001",
  appointmentLeadConversation: "e2e00003-0000-0000-0000-000000000002",
  // Product Track slice 9 (Property Domain Model + Property Matching V1) —
  // deliberately matches conversationLead's kauf/3-Zimmer-Wohnung/Hamburg
  // profile so the Lead Detail page's "Passende Immobilien" section has a
  // real match to render in the E2E run, not an empty state.
  property: "e2e00004-0000-0000-0000-000000000001",
  // Product Track slice 10 (Feedback Intelligence V1) — a pre-seeded,
  // already-analyzed feedback item so the Settings > Feedback history and
  // its AI/human-override rendering can be asserted without depending on
  // a real, potentially unavailable AI provider call during the E2E run.
  feedbackItem: "e2e00005-0000-0000-0000-000000000001",
  feedbackAnalysis: "e2e00006-0000-0000-0000-000000000001",
} as const;

const CONVERSATION_LEAD_NAME = "E2E QA Fixture — Conversation Lead";
const APPOINTMENT_LEAD_NAME = "E2E QA Fixture — Appointment Lead";

/** role→senderType, exactly the mapping the real widget write path uses
 * (see mapTranscriptRoleToSenderType in conversation-rules.ts) — kept as a
 * small local literal here rather than importing app code into the E2E
 * fixture layer (tests/e2e/ deliberately doesn't depend on src/). */
const CONVERSATION_LEAD_MESSAGES = [
  { senderType: "ai", content: "Hallo! Wie kann ich Ihnen helfen?" },
  { senderType: "lead", content: "Ich suche eine 3-Zimmer-Wohnung in Hamburg." },
  { senderType: "ai", content: "Gerne! In welchem Budget bewegen Sie sich?" },
  { senderType: "lead", content: "Bis 450.000 Euro, Finanzierung ist vorhanden." },
] as const;

const APPOINTMENT_LEAD_MESSAGES = [
  { senderType: "ai", content: "Hallo! Wie kann ich Ihnen helfen?" },
  { senderType: "lead", content: "Ich hätte gerne einen Besichtigungstermin." },
] as const;

export async function seedFixtures(admin: SupabaseClient): Promise<void> {
  // leads.messages (legacy JSONB) is written too, alongside the canonical
  // tables below — not because anything still reads it (the Conversations/
  // Lead-Detail UI reads exclusively from conversations/messages now, see
  // ROADMAP.md), but so this fixture keeps mirroring what a real migrated
  // production lead actually looks like (both the legacy column and its
  // canonical counterpart populated), the same shape the backfill produced.
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
        messages: CONVERSATION_LEAD_MESSAGES.map((m) => ({
          role: m.senderType === "lead" ? "user" : "assistant",
          content: m.content,
        })),
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
        messages: APPOINTMENT_LEAD_MESSAGES.map((m) => ({
          role: m.senderType === "lead" ? "user" : "assistant",
          content: m.content,
        })),
      },
    ],
    { onConflict: "id" },
  );
  if (leadsError) throw new Error(`seedFixtures: leads upsert failed: ${leadsError.message}`);

  const { error: convError } = await admin.from("conversations").upsert(
    [
      {
        id: FIXTURE_IDS.conversationLeadConversation,
        lead_id: FIXTURE_IDS.conversationLead,
        company_id: QA_COMPANY_ID,
        channel: "website",
      },
      {
        id: FIXTURE_IDS.appointmentLeadConversation,
        lead_id: FIXTURE_IDS.appointmentLead,
        company_id: QA_COMPANY_ID,
        channel: "website",
      },
    ],
    { onConflict: "id" },
  );
  if (convError) throw new Error(`seedFixtures: conversations upsert failed: ${convError.message}`);

  // Reset-and-reinsert rather than upsert (see FIXTURE_IDS's doc comment) —
  // idempotent and side-steps the sequence-on-update footgun entirely.
  for (const [conversationId, messages] of [
    [FIXTURE_IDS.conversationLeadConversation, CONVERSATION_LEAD_MESSAGES],
    [FIXTURE_IDS.appointmentLeadConversation, APPOINTMENT_LEAD_MESSAGES],
  ] as const) {
    const { error: deleteError } = await admin
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);
    if (deleteError) {
      throw new Error(
        `seedFixtures: message reset failed for ${conversationId}: ${deleteError.message}`,
      );
    }
    const { error: insertError } = await admin.from("messages").insert(
      messages.map((m) => ({
        conversation_id: conversationId,
        company_id: QA_COMPANY_ID,
        sender_type: m.senderType,
        content: m.content,
      })),
    );
    if (insertError) {
      throw new Error(
        `seedFixtures: message insert failed for ${conversationId}: ${insertError.message}`,
      );
    }
  }

  // One scheduled follow-up (step 1) on the conversation-lead fixture, so
  // the E2E suite can verify the Lead-Detail follow-up card and its
  // "Follow-ups stoppen" action against real data — same delete-and-
  // reinsert-by-conversation_id idempotency pattern as messages above.
  // after_sequence = 3 matches CONVERSATION_LEAD_MESSAGES' last (0-based)
  // index (4 messages → indices 0..3).
  const { error: followupDeleteError } = await admin
    .from("conversation_followups")
    .delete()
    .eq("conversation_id", FIXTURE_IDS.conversationLeadConversation);
  if (followupDeleteError) {
    throw new Error(`seedFixtures: follow-up reset failed: ${followupDeleteError.message}`);
  }
  const { error: followupInsertError } = await admin.from("conversation_followups").insert({
    conversation_id: FIXTURE_IDS.conversationLeadConversation,
    company_id: QA_COMPANY_ID,
    step: 1,
    status: "scheduled",
    scheduled_for: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    after_sequence: 3,
  });
  if (followupInsertError) {
    throw new Error(`seedFixtures: follow-up insert failed: ${followupInsertError.message}`);
  }

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

  // Property Domain Model fixture (Product Track slice 9) — one active
  // property the conversationLead fixture (kauf, 3-Zimmer-Wohnung,
  // Hamburg) matches well, so both /properties and the Lead Detail
  // "Passende Immobilien" section have real data to render.
  const { error: propertyError } = await admin.from("properties").upsert(
    [
      {
        id: FIXTURE_IDS.property,
        company_id: QA_COMPANY_ID,
        title: "E2E QA Fixture — 3-Zimmer-Wohnung Hamburg",
        status: "active",
        marketing_type: "kauf",
        price: 420_000,
        property_type: "wohnung",
        postal_code: "20095",
        city: "Hamburg",
        country: "DE",
        living_area_m2: 85,
        rooms: 3,
        has_balcony: true,
      },
    ],
    { onConflict: "id" },
  );
  if (propertyError)
    throw new Error(`seedFixtures: property upsert failed: ${propertyError.message}`);

  // Feedback Intelligence fixture (Product Track slice 10) — pre-seeded
  // as already-analyzed (not submitted live during the E2E run) so the
  // assertions never depend on a real, potentially unavailable AI
  // provider call succeeding within the test's timeout.
  const { error: feedbackError } = await admin.from("feedback_items").upsert(
    [
      {
        id: FIXTURE_IDS.feedbackItem,
        company_id: QA_COMPANY_ID,
        raw_content:
          "E2E QA Fixture — Ich würde gerne mehrere Besichtigungstermine gleichzeitig verschieben können.",
        status: "new",
        analysis_status: "completed",
      },
    ],
    { onConflict: "id" },
  );
  if (feedbackError)
    throw new Error(`seedFixtures: feedback_items upsert failed: ${feedbackError.message}`);

  const { error: feedbackAnalysisError } = await admin.from("feedback_analyses").upsert(
    [
      {
        id: FIXTURE_IDS.feedbackAnalysis,
        feedback_item_id: FIXTURE_IDS.feedbackItem,
        company_id: QA_COMPANY_ID,
        analysis_version: 1,
        category: "feature_request",
        sentiment: "neutral",
        summary: "Bulk rescheduling for appointments",
        suggested_priority: "medium",
        confidence: 0.8,
        model: "e2e-fixture",
        provider: "e2e-fixture",
      },
    ],
    { onConflict: "id" },
  );
  if (feedbackAnalysisError)
    throw new Error(
      `seedFixtures: feedback_analyses upsert failed: ${feedbackAnalysisError.message}`,
    );
}

export async function cleanupFixtures(admin: SupabaseClient): Promise<void> {
  // Order matters: children before parents (ON DELETE CASCADE would handle
  // it anyway, but deleting explicitly here is clearer about intent and
  // doesn't rely on cascade behavior staying unchanged — same convention
  // this file already used for appointments before this slice).
  await admin
    .from("conversation_followups")
    .delete()
    .eq("conversation_id", FIXTURE_IDS.conversationLeadConversation);
  await admin
    .from("messages")
    .delete()
    .eq("conversation_id", FIXTURE_IDS.conversationLeadConversation);
  await admin
    .from("messages")
    .delete()
    .eq("conversation_id", FIXTURE_IDS.appointmentLeadConversation);
  await admin.from("conversations").delete().eq("id", FIXTURE_IDS.conversationLeadConversation);
  await admin.from("conversations").delete().eq("id", FIXTURE_IDS.appointmentLeadConversation);
  await admin.from("appointments").delete().eq("id", FIXTURE_IDS.appointment);
  await admin.from("leads").delete().eq("id", FIXTURE_IDS.conversationLead);
  await admin.from("leads").delete().eq("id", FIXTURE_IDS.appointmentLead);
  await admin.from("properties").delete().eq("id", FIXTURE_IDS.property);
  await admin.from("feedback_analyses").delete().eq("id", FIXTURE_IDS.feedbackAnalysis);
  await admin.from("feedback_items").delete().eq("id", FIXTURE_IDS.feedbackItem);
}
