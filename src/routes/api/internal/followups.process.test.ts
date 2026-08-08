import { describe, expect, it } from "vitest";
import { isAuthorized, isWorkerEnabled, timingSafeEqualStrings } from "./followups.process";

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://example.com/api/internal/followups/process", { headers });
}

describe("timingSafeEqualStrings", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualStrings("secret-value", "secret-value")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqualStrings("secret-value", "secret-valuf")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqualStrings("short", "a-much-longer-secret-value")).toBe(false);
  });

  it("returns false for empty vs. non-empty", () => {
    expect(timingSafeEqualStrings("", "secret")).toBe(false);
  });
});

describe("isAuthorized", () => {
  const secret = "test-cron-secret-value";

  it("authorizes a matching Bearer token", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), secret)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(isAuthorized(requestWithAuth("Bearer wrong-value"), secret)).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isAuthorized(requestWithAuth(null), secret)).toBe(false);
  });

  it("rejects a header without the Bearer prefix", () => {
    expect(isAuthorized(requestWithAuth(secret), secret)).toBe(false);
  });

  it("rejects an empty Bearer token", () => {
    expect(isAuthorized(requestWithAuth("Bearer "), secret)).toBe(false);
  });

  it("fails closed when CRON_SECRET itself is not configured, even with a header present", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), undefined)).toBe(false);
    expect(isAuthorized(requestWithAuth(`Bearer ${secret}`), "")).toBe(false);
  });

  it("is case-sensitive on the token value", () => {
    expect(isAuthorized(requestWithAuth(`Bearer ${secret.toUpperCase()}`), secret)).toBe(false);
  });
});

describe("isWorkerEnabled", () => {
  it("defaults to enabled when unset", () => {
    expect(isWorkerEnabled(undefined)).toBe(true);
  });

  it("defaults to enabled for an empty string", () => {
    expect(isWorkerEnabled("")).toBe(true);
  });

  it("is disabled for common falsy spellings (case/whitespace-insensitive)", () => {
    for (const value of ["false", "FALSE", " false ", "0", "no", "NO", "off", "Off"]) {
      expect(isWorkerEnabled(value)).toBe(false);
    }
  });

  it("stays enabled for anything else, including common truthy-looking values", () => {
    expect(isWorkerEnabled("true")).toBe(true);
    expect(isWorkerEnabled("1")).toBe(true);
    expect(isWorkerEnabled("yes")).toBe(true);
    expect(isWorkerEnabled("on")).toBe(true);
  });
});
