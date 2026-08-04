import type { User } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/validate-email";

export type EmailChangeOutcome = "pending" | "changed" | "unchanged";

/**
 * Classifies the result of `supabase.auth.updateUser({ email })` using only
 * documented fields of the installed @supabase/supabase-js `User` type
 * (`email`, `new_email`) — never an assumed/undocumented shape. When the
 * response doesn't clearly confirm the new address is already active, this
 * falls back to "pending" so the UI never claims a change completed before
 * it actually did.
 */
export function classifyEmailChangeResult(
  currentEmail: string | null | undefined,
  requestedEmail: string,
  updatedUser: User | null | undefined,
): EmailChangeOutcome {
  const normalizedRequested = normalizeEmail(requestedEmail);
  const normalizedCurrent = normalizeEmail(currentEmail ?? "");

  if (normalizedRequested === normalizedCurrent) {
    return "unchanged";
  }

  if (!updatedUser) {
    return "pending";
  }

  if (updatedUser.new_email) {
    return "pending";
  }

  if (updatedUser.email && normalizeEmail(updatedUser.email) === normalizedRequested) {
    return "changed";
  }

  // Ambiguous shape — never claim success before it's actually confirmed.
  return "pending";
}
