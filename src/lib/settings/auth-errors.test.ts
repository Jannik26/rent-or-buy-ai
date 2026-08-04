import { describe, expect, it } from "vitest";
import { mapAuthErrorMessage } from "@/lib/settings/auth-errors";

describe("mapAuthErrorMessage", () => {
  it("maps 'already registered' to a friendly duplicate-email message", () => {
    expect(mapAuthErrorMessage(new Error("User already registered"))).toBe(
      "Diese E-Mail-Adresse wird bereits verwendet.",
    );
  });

  it("maps 'invalid email' to a friendly validation message", () => {
    expect(mapAuthErrorMessage(new Error("Invalid email address"))).toBe(
      "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    );
  });

  it("maps expired/JWT/session errors to a re-login message", () => {
    expect(mapAuthErrorMessage(new Error("JWT expired"))).toBe(
      "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    );
    expect(mapAuthErrorMessage(new Error("invalid session"))).toBe(
      "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    );
  });

  it("maps rate-limit errors to a retry-later message", () => {
    expect(mapAuthErrorMessage(new Error("Rate limit exceeded"))).toBe(
      "Zu viele Versuche. Bitte versuchen Sie es in einigen Minuten erneut.",
    );
  });

  it("maps network errors to a connectivity message", () => {
    expect(mapAuthErrorMessage(new Error("Network request failed"))).toBe(
      "Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(mapAuthErrorMessage(new Error("some obscure postgres constraint violation"))).toBe(
      "Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.",
    );
  });

  it("never throws and never leaks raw text for non-Error values", () => {
    expect(() => mapAuthErrorMessage("plain string error")).not.toThrow();
    expect(() => mapAuthErrorMessage(undefined)).not.toThrow();
    expect(() => mapAuthErrorMessage(null)).not.toThrow();
    expect(mapAuthErrorMessage(undefined)).toBe(
      "Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.",
    );
  });
});
