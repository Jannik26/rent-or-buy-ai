import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReceivedEmail } from "./resend-receiving";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Example shape verified against Resend's own documented API reference
// for GET /emails/receiving/{id}.
const EXAMPLE_RECEIVED_EMAIL = {
  object: "email",
  id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
  to: ["reply+abc123@reply.estateai.de.test"],
  from: "lead@example.com",
  created_at: "2026-04-03T22:13:42.674Z",
  subject: "Re: Kurze Rückfrage",
  html: "<p>Danke, das <strong>klingt gut</strong>!</p>",
  text: "Danke, das klingt gut!",
  headers: { from: "lead@example.com" },
  bcc: [],
  cc: [],
  reply_to: [],
  message_id: "<111-222-333@email.example.com>",
  attachments: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchReceivedEmail", () => {
  it("parses a well-formed 200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, EXAMPLE_RECEIVED_EMAIL)));
    const result = await fetchReceivedEmail("4ef9a417-02e9-4d39-ad75-9611e0fcc33c", "re_test_key");
    expect(result).toEqual({
      ok: true,
      email: {
        id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
        from: "lead@example.com",
        to: ["reply+abc123@reply.estateai.de.test"],
        subject: "Re: Kurze Rückfrage",
        text: "Danke, das klingt gut!",
        html: "<p>Danke, das <strong>klingt gut</strong>!</p>",
        messageId: "<111-222-333@email.example.com>",
        attachmentCount: 0,
      },
    });
  });

  it("counts attachments without fetching their content", async () => {
    const withAttachments = {
      ...EXAMPLE_RECEIVED_EMAIL,
      attachments: [
        { id: "a1", filename: "x.png" },
        { id: "a2", filename: "y.pdf" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, withAttachments)));
    const result = await fetchReceivedEmail("x", "re_test_key");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email.attachmentCount).toBe(2);
  });

  it("handles a null text field (html-only email)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { ...EXAMPLE_RECEIVED_EMAIL, text: null })),
    );
    const result = await fetchReceivedEmail("x", "re_test_key");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email.text).toBeNull();
  });

  it("sends the Authorization header correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, EXAMPLE_RECEIVED_EMAIL));
    vi.stubGlobal("fetch", fetchMock);
    await fetchReceivedEmail("x", "re_super_secret_key");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/receiving/x");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_super_secret_key");
  });

  it("maps 404 to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { message: "not found" })));
    expect(await fetchReceivedEmail("missing", "re_test_key")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("maps 429 to transient_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, {})));
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "transient_error",
    });
  });

  it("maps 500 to transient_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "transient_error",
    });
  });

  it("maps 401/403 to permanent_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "permanent_error",
    });
  });

  it("maps a network-level failure to transient_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "transient_error",
    });
  });

  it("treats a 200 response missing required fields as permanent_error rather than guessing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { subject: "no id or from" })));
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "permanent_error",
    });
  });

  it("handles a non-JSON body without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>error</html>", { status: 200 })),
    );
    expect(await fetchReceivedEmail("x", "re_test_key")).toEqual({
      ok: false,
      reason: "permanent_error",
    });
  });
});
