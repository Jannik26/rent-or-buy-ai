// Playwright "teardown" project, linked to global.setup.ts via
// playwright.config.ts (`teardown: "cleanup"`) — always runs after the
// dependent test projects finish (pass or fail), so fixtures never
// accumulate across runs even if a test throws.
import { test as teardown } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { cleanupFixtures } from "./fixtures-data";

teardown("clean up QA fixtures", async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    // Setup would already have thrown on this — nothing to clean up if it
    // never ran, so this is a no-op rather than a hard failure.
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  await cleanupFixtures(admin);
});
