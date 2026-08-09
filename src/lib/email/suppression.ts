// Persistent per-company email suppression list (Product Track slice 8A,
// see ROADMAP.md) — a bounce, complaint, or unsubscribe against one
// address must permanently stop *future* automated follow-up emails to
// that address, for that company, until someone explicitly removes it
// (never automatic — see ROADMAP.md's opt-out risk writeup).
//
// Tenant-scoped by design: `(company_id, email)` is the unique key, not
// `email` alone — a suppression recorded for one company must never leak
// into or affect another company's ability to email the same address.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SuppressionReason = "bounce" | "complaint" | "unsubscribe" | "manual";

/** Checked before every external send (email-delivery-adapter.ts) — a
 * suppressed recipient must never reach the provider. Returns false (not
 * suppressed) on no match, true otherwise. Case-insensitive: email
 * addresses are compared as-is here because callers already pass the
 * normalized (trimmed/lowercased) address from resolveRecipientEmail. */
export async function isSuppressed(
  client: SupabaseClient<Database>,
  args: { companyId: string; email: string },
): Promise<boolean> {
  const { data, error } = await client
    .from("email_suppressions")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("email", args.email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

/** Idempotent by construction: `(company_id, email)` is UNIQUE, so a
 * repeated suppression (e.g. two bounce webhooks, or a bounce followed by
 * a later complaint for the same address) is a safe no-op via
 * `onConflict` — the *first* recorded reason wins and is never
 * overwritten by a later one. That's a deliberate choice, not an
 * oversight: the first reason is what actually happened first, and a
 * complaint arriving after an address was already suppressed for
 * bouncing doesn't need to "upgrade" anything — the recipient is already
 * fully suppressed either way. */
export async function addSuppression(
  client: SupabaseClient<Database>,
  args: { companyId: string; email: string; reason: SuppressionReason },
): Promise<void> {
  const { error } = await client
    .from("email_suppressions")
    .upsert(
      { company_id: args.companyId, email: args.email, reason: args.reason },
      { onConflict: "company_id,email", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}
