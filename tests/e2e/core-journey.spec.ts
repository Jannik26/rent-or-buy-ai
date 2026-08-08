import { expect, test } from "@playwright/test";
import { FIXTURE_IDS } from "./fixtures-data";

const CONVERSATION_LEAD_NAME = "E2E QA Fixture — Conversation Lead";
const APPOINTMENT_LEAD_NAME = "E2E QA Fixture — Appointment Lead";

/**
 * A pre-existing, intermittent, dev-server-only React warning that is not
 * scoped to any one page: reproduced during this slice on /dashboard,
 * /conversations and /analytics alike (none of the first two render any
 * chart), and never reproduced against a production build (`vite build` +
 * `vite preview`) in repeated tries — only against `vite dev`. The
 * `_authenticated` layout route (src/routes/_authenticated/route.tsx) sets
 * `ssr: false` with an async `beforeLoad`, so every authenticated page goes
 * through a pending→resolved mount transition on first load; combined with
 * Vite dev's on-demand route-module compilation (which shifts timing on a
 * cold module cache), that's the suspected source, not any one page's code.
 * This matches the already-documented, pre-existing /auth hydration warning
 * from earlier slices — same class of dev-only mount-timing noise, not a
 * production defect. Filtered out here (only this exact message) so the
 * assertion keeps catching real regressions instead of flaking on this known,
 * out-of-scope-for-this-slice issue; see ROADMAP.md for the open follow-up.
 */
const KNOWN_DEV_ONLY_MOUNT_RACE =
  "Can't perform a React state update on a component that hasn't mounted yet.";

/** Collects console messages of type "error" for the duration of a test —
 * used to assert the core journey never triggers a real product error
 * (distinct from framework-noise like React DevTools info logs, which are
 * never type "error"). */
function trackConsoleErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes(KNOWN_DEV_ONLY_MOUNT_RACE)) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("Auth guard", () => {
  // Overrides the project-level authenticated storageState for just this
  // one test — a fresh, signed-out context, exactly what "unauthenticated
  // visitor" needs to mean.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an unauthenticated visitor is redirected away from a protected route", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe("Core journey (authenticated as the QA/E2E test tenant)", () => {
  test("A+B: dashboard loads after auth and shows the primary navigation", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Willkommen zurück");
    for (const label of ["Dashboard", "Leads", "Conversations", "Appointments", "Analytics"]) {
      // exact: true — the dashboard's own stat cards are also links whose
      // accessible name *contains* "Leads" (e.g. "Neue Leads 2 +2 diese
      // Woche"), so a substring match would be ambiguous here.
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    expect(errors, `console errors on /dashboard: ${errors.join("\n")}`).toEqual([]);
  });

  test("C: leads page shows only the QA tenant's own fixture leads (tenant isolation) and lead detail opens", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();

    // Exact count, not just "is visible" — this is the tenant-isolation
    // assertion: exactly the two fixtures this run seeded, nothing bled in
    // from another tenant and nothing accumulated from a previous run
    // (fixtures are upserted by a fixed id, never duplicated).
    await expect(page.getByText(/^2 Leads insgesamt$/)).toBeVisible();
    await expect(page.getByText(CONVERSATION_LEAD_NAME)).toBeVisible();
    await expect(page.getByText(APPOINTMENT_LEAD_NAME)).toBeVisible();

    await page.getByText(CONVERSATION_LEAD_NAME).click();
    await expect(page).toHaveURL(new RegExp(FIXTURE_IDS.conversationLead));
    await expect(page.getByRole("heading", { name: CONVERSATION_LEAD_NAME })).toBeVisible();
    await expect(page.getByRole("button", { name: "Als qualifiziert markieren" })).toBeVisible();

    expect(errors, `console errors on /leads: ${errors.join("\n")}`).toEqual([]);
  });

  test("D: conversations page shows real message history, search and a filter work", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/conversations");
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
    // Scoped to the list panel throughout this test: once a conversation
    // is opened, its name is shown a second time in the detail header, so
    // an unscoped getByText(name) becomes ambiguous from that point on —
    // see the data-testid comments in conversations.tsx.
    const list = page.getByTestId("conversation-list");
    await expect(list.getByText(CONVERSATION_LEAD_NAME)).toBeVisible();
    await expect(list.getByText(APPOINTMENT_LEAD_NAME)).toBeVisible();

    await list.getByText(CONVERSATION_LEAD_NAME).click();
    await expect(page.getByRole("heading", { name: CONVERSATION_LEAD_NAME })).toBeVisible();
    const thread = page.getByTestId("conversation-messages");
    await expect(thread.getByText("Ich suche eine 3-Zimmer-Wohnung in Hamburg.")).toBeVisible();
    await expect(thread.getByText("Bis 450.000 Euro, Finanzierung ist vorhanden.")).toBeVisible();

    // Search: narrows the list down to the matching fixture only.
    await page.getByPlaceholder("Nach Name suchen…").fill("Conversation Lead");
    await expect(list.getByText(CONVERSATION_LEAD_NAME)).toBeVisible();
    await expect(list.getByText(APPOINTMENT_LEAD_NAME)).not.toBeVisible();
    await page.getByPlaceholder("Nach Name suchen…").fill("");

    // Status filter: "Termin" should isolate the appointment-lead fixture.
    await page.getByRole("button", { name: "Termin", exact: true }).click();
    await expect(list.getByText(APPOINTMENT_LEAD_NAME)).toBeVisible();
    // The conversation opened above is still shown in the detail panel on
    // the right (filtering the list doesn't close it) — scoped to the
    // list is what actually proves the filter took effect.
    await expect(list.getByText(CONVERSATION_LEAD_NAME)).not.toBeVisible();
    await page.getByRole("button", { name: "Alle Status" }).click();

    expect(errors, `console errors on /conversations: ${errors.join("\n")}`).toEqual([]);
  });

  test("E: appointments page shows the fixture appointment, and the cancel/restore lifecycle works", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
    await expect(page.getByText(APPOINTMENT_LEAD_NAME)).toBeVisible();
    await expect(page.getByText("Musterstraße 1, 20095 Hamburg")).toBeVisible();

    // Exercise the real lifecycle (cancel, then undo) on the fixture lead
    // only — never touches any real customer appointment.
    await page.getByText(APPOINTMENT_LEAD_NAME).click();
    await expect(page).toHaveURL(new RegExp(FIXTURE_IDS.appointmentLead));

    const cancelButton = page.getByRole("button", { name: "Termin zurücknehmen" });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();
    await expect(page.getByText("Termin zurückgenommen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Termin vereinbaren" })).toBeVisible();

    await page.getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByRole("button", { name: "Termin zurücknehmen" })).toBeVisible();

    expect(errors, `console errors on /appointments: ${errors.join("\n")}`).toEqual([]);
  });

  test("F: analytics page loads, KPIs render, and switching the time window never crashes", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
    await expect(page.getByText("Neue Leads")).toBeVisible();

    for (const windowLabel of [
      "Letzte 7 Tage",
      "Letzte 90 Tage",
      "Gesamter Zeitraum",
      "Letzte 30 Tage",
    ]) {
      await page.getByRole("button", { name: windowLabel }).click();
      await expect(page.getByText("Neue Leads")).toBeVisible();
      await expect(
        page.getByText("Analytics-Daten konnten nicht geladen werden"),
      ).not.toBeVisible();
    }

    expect(errors, `console errors on /analytics: ${errors.join("\n")}`).toEqual([]);
  });

  test("G: primary navigation moves cleanly between every core section", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/dashboard");

    const steps: [string, string][] = [
      ["Leads", "Leads"],
      ["Conversations", "Conversations"],
      ["Appointments", "Appointments"],
      ["Analytics", "Analytics"],
      ["Dashboard", "Willkommen zurück"],
    ];
    for (const [navLabel, expectedHeadingText] of steps) {
      // exact: true — see the note on the same pattern in test A+B.
      await page.getByRole("link", { name: navLabel, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(expectedHeadingText);
    }

    expect(errors, `console errors during navigation: ${errors.join("\n")}`).toEqual([]);
  });
});
