import { expect, test } from "@playwright/test";

const CONVERSATION_LEAD_NAME = "E2E QA Fixture — Conversation Lead";

/** No horizontal scroll at a phone viewport is the one layout property
 * worth asserting for a smoke test (task instructions: no pixel-perfect
 * screenshot suite) — anything wider than the viewport is an unambiguous,
 * real regression signal regardless of exact spacing/typography. */
async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page has horizontal overflow at a mobile viewport").toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

test("mobile smoke: app loads, mobile navigation opens, Leads, Immobilien and Conversations are reachable", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Willkommen zurück");
  await expectNoHorizontalOverflow(page);

  const menuButton = page.getByRole("button", { name: "Menü öffnen" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  // exact: true — the dashboard's own stat cards are also links whose
  // accessible name contains "Leads" (e.g. "Neue Leads 2 +2 diese Woche").
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("link", { name: "Immobilien" }).click();
  await expect(page.getByRole("heading", { name: "Immobilien" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("link", { name: "Conversations" }).click();
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  await expect(page.getByText(CONVERSATION_LEAD_NAME)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
