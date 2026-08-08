// Playwright "setup" project: runs once before the chromium/mobile-chromium
// projects (see playwright.config.ts `dependencies`). Two responsibilities:
//
// 1. Seed deterministic fixtures into the dedicated QA/E2E tenant (never
//    touches any other tenant's data — see fixtures-data.ts).
// 2. Authenticate as the QA/E2E account WITHOUT a new Supabase signup —
//    an admin-generated magic link (the same mechanism proven to work
//    manually during the Conversations V1 slice) gives a real session,
//    which is then persisted as Playwright `storageState` so every
//    subsequent test reuses it instead of re-authenticating (and re-risking
//    Supabase's auth email rate limit) on every run.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY come from the local, untracked
// .env (loaded via `node --env-file-if-exists=.env`, see package.json's
// test:e2e script) — never hardcoded, never logged, never sent to the
// browser context under test (only used here, in the Node-side setup
// process, to call the Admin API and to seed fixtures directly via
// Postgres).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { QA_EMAIL, seedFixtures } from "./fixtures-data";

// import.meta.url, not __dirname — this repo's package.json sets
// "type": "module", so these files run as native ESM under Node.
const dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_STATE_PATH = path.join(dirname, ".auth/qa-user.json");

setup("seed QA fixtures and authenticate", async ({ page, baseURL }) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Run E2E tests via `npm run test:e2e` " +
        "(loads them from your local .env) — see tests/e2e/README.md.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  await seedFixtures(admin);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: QA_EMAIL,
    options: { redirectTo: `${baseURL}/dashboard` },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(
      `Could not generate a Supabase magic link for the QA test account (${QA_EMAIL}): ` +
        `${error?.message ?? "no action_link in response"}`,
    );
  }

  await page.goto(data.properties.action_link);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  // A stable, always-present nav link — confirms the authenticated layout
  // actually rendered, not just that the URL happened to change.
  await expect(page.getByRole("link", { name: "Conversations" })).toBeVisible();

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
