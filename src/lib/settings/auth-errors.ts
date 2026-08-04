/**
 * Maps Supabase/auth errors to safe, German, user-facing messages. Never
 * surfaces raw Supabase/Postgres error text (which can contain internal
 * details) to the user.
 */
export function mapAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (message.includes("already registered") || message.includes("already exists")) {
    return "Diese E-Mail-Adresse wird bereits verwendet.";
  }
  if (message.includes("invalid email")) {
    return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  }
  if (message.includes("jwt") || message.includes("session") || message.includes("expired")) {
    return "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";
  }
  if (message.includes("rate limit") || message.includes("429") || message.includes("too many")) {
    return "Zu viele Versuche. Bitte versuchen Sie es in einigen Minuten erneut.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.";
  }

  return "Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.";
}
