// Real-DB integration tests for the public unsubscribe endpoint (Product
// Track slice 8A, see ROADMAP.md) — real token signing/verification, real
// suppression writes against the real, connected Supabase project.
//
// Skipped entirely (not failed) without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// — same convention as every other integration test in this repo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleUnsubscribeGet, handleUnsubscribePost } from "./email.unsubscribe";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import type { Database } from "@/integrations/supabase/types";

const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Two real, distinct, pre-existing tenants — the same two used by the
// existing supabase/tests/*.sql RLS scripts, reused here for the same
// reason (no new fixture company needed, tenant isolation is provable
// against real, separate companies).
const COMPANY_A = "74183d79-2887-4579-9a9c-772eb137c3f0";
const COMPANY_B = "e2a7b36e-d374-4895-99ce-f5b2f21eb993";
const SECRET = "test-only-unsubscribe-secret-slice-8a-integration";

function requestFor(method: "GET" | "POST", token: string | null): Request {
  const url = new URL("https://example.com/api/public/email/unsubscribe");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url.toString(), { method });
}

describe.skipIf(!hasCredentials)("Public unsubscribe endpoint (real DB, real tokens)", () => {
  let admin: SupabaseClient<Database>;
  const seededEmails: { companyId: string; email: string }[] = [];

  beforeAll(() => {
    admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
  });

  afterAll(async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    for (const { companyId, email } of seededEmails) {
      await admin
        .from("email_suppressions")
        .delete()
        .eq("company_id", companyId)
        .eq("email", email);
    }
  });

  it("scenario: GET with a valid token shows a confirmation page and does NOT mutate anything (scanner-safety)", async () => {
    const email = "get-confirm-only@example.com";
    const token = signUnsubscribeToken({ companyId: COMPANY_A, email }, SECRET);
    const res = await handleUnsubscribeGet(requestFor("GET", token));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html.toLowerCase()).toContain("stoppen");

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", COMPANY_A)
      .eq("email", email)
      .maybeSingle();
    expect(suppression).toBeNull(); // GET must never mutate
  }, 20_000);

  it("scenario: POST with a valid token applies the suppression and is idempotent on repeated clicks", async () => {
    const email = "post-unsubscribe@example.com";
    seededEmails.push({ companyId: COMPANY_A, email });
    const token = signUnsubscribeToken({ companyId: COMPANY_A, email }, SECRET);

    const res1 = await handleUnsubscribePost(requestFor("POST", token));
    expect(res1.status).toBe(200);
    const html1 = await res1.text();
    expect(html1.toLowerCase()).toContain("beendet");

    const { data: suppressionAfter1 } = await admin
      .from("email_suppressions")
      .select("reason")
      .eq("company_id", COMPANY_A)
      .eq("email", email)
      .maybeSingle();
    expect(suppressionAfter1?.reason).toBe("unsubscribe");

    // One-click unsubscribe (RFC 8058) and a human clicking twice both
    // hit this exact path repeatedly — must stay a safe no-op.
    const res2 = await handleUnsubscribePost(requestFor("POST", token));
    expect(res2.status).toBe(200);

    const { count } = await admin
      .from("email_suppressions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_A)
      .eq("email", email);
    expect(count).toBe(1);
  }, 20_000);

  it("scenario: an invalid/tampered token is rejected, no mutation, generic error page", async () => {
    const email = "should-not-be-suppressed@example.com";
    const validToken = signUnsubscribeToken({ companyId: COMPANY_A, email }, SECRET);
    const [, signature] = validToken.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ companyId: COMPANY_A, email: "attacker-target@example.com" }),
      "utf8",
    ).toString("base64url");
    const forgedToken = `${forgedPayload}.${signature}`;

    const res = await handleUnsubscribePost(requestFor("POST", forgedToken));
    expect(res.status).toBe(400);

    const { data: suppression } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", COMPANY_A)
      .eq("email", "attacker-target@example.com")
      .maybeSingle();
    expect(suppression).toBeNull();
  }, 20_000);

  it("scenario: a missing token is rejected on both GET and POST", async () => {
    const getRes = await handleUnsubscribeGet(requestFor("GET", null));
    expect(getRes.status).toBe(400);
    const postRes = await handleUnsubscribePost(requestFor("POST", null));
    expect(postRes.status).toBe(400);
  }, 20_000);

  it("scenario: a token signed for company A cannot suppress an address under company B's namespace (tenant isolation)", async () => {
    const email = "shared-address@example.com";
    seededEmails.push({ companyId: COMPANY_A, email }, { companyId: COMPANY_B, email });
    const tokenForA = signUnsubscribeToken({ companyId: COMPANY_A, email }, SECRET);

    await handleUnsubscribePost(requestFor("POST", tokenForA));

    const { data: suppressedForA } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", COMPANY_A)
      .eq("email", email)
      .maybeSingle();
    expect(suppressedForA).not.toBeNull();

    const { data: suppressedForB } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("company_id", COMPANY_B)
      .eq("email", email)
      .maybeSingle();
    expect(suppressedForB).toBeNull(); // company B's ability to email this address is untouched
  }, 20_000);
});
