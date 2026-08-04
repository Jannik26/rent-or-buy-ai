import { describe, expect, it } from "vitest";
import { classifyEmailChangeResult } from "@/lib/settings/email-change";
import type { User } from "@supabase/supabase-js";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as User;
}

describe("classifyEmailChangeResult", () => {
  it("returns 'unchanged' when the requested email equals the current one", () => {
    expect(classifyEmailChangeResult("max@example.com", "max@example.com", null)).toBe("unchanged");
  });

  it("is case-insensitive/whitespace-insensitive for the 'unchanged' check", () => {
    expect(classifyEmailChangeResult("max@example.com", "  MAX@EXAMPLE.COM  ", null)).toBe(
      "unchanged",
    );
  });

  it("returns 'pending' when the response has a documented new_email field", () => {
    const user = makeUser({ email: "max@example.com", new_email: "neu@example.com" });
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", user)).toBe("pending");
  });

  it("returns 'changed' when the response's email already equals the requested address", () => {
    const user = makeUser({ email: "neu@example.com" });
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", user)).toBe("changed");
  });

  it("falls back to 'pending' when the response is null/undefined (ambiguous)", () => {
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", null)).toBe("pending");
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", undefined)).toBe(
      "pending",
    );
  });

  it("falls back to 'pending' when the response's email neither matches old nor requested (ambiguous)", () => {
    const user = makeUser({ email: "something-else@example.com" });
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", user)).toBe("pending");
  });

  it("never returns 'changed' before the address is actually confirmed", () => {
    // Old email still present, no new_email field either -> ambiguous, must stay cautious.
    const user = makeUser({ email: "max@example.com" });
    expect(classifyEmailChangeResult("max@example.com", "neu@example.com", user)).toBe("pending");
  });
});
