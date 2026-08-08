import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendEmailProvider } from "./resend-provider";
import type { EmailMessage } from "@/lib/email/email-provider";

const BASE_MESSAGE: EmailMessage = {
  to: { email: "lead@example.com" },
  from: {
    email: "follow-up@mail.estateai.de",
    name: "Muster Immobilien · automatisierter Assistent",
  },
  replyTo: { email: "hello@estateai.de" },
  subject: "Kurze Rückfrage zu Ihrer Anfrage bei Muster Immobilien",
  text: "Hallo! ...",
  html: "<p>Hallo!</p>",
  idempotencyKey: "f0130001-0000-0000-0000-000000000001",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createResendEmailProvider — request shape", () => {
  it("sends the correct method, url, headers (Authorization, Idempotency-Key), and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createResendEmailProvider("re_test_key");
    await provider.send(BASE_MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toBe(BASE_MESSAGE.idempotencyKey);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe(
      "Muster Immobilien · automatisierter Assistent <follow-up@mail.estateai.de>",
    );
    expect(body.to).toEqual(["lead@example.com"]);
    expect(body.reply_to).toEqual(["hello@estateai.de"]);
    expect(body.subject).toBe(BASE_MESSAGE.subject);
    expect(body.text).toBe(BASE_MESSAGE.text);
    expect(body.html).toBe(BASE_MESSAGE.html);
  });

  it("never leaks the API key into the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createResendEmailProvider("re_super_secret_key");
    await provider.send(BASE_MESSAGE);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain("re_super_secret_key");
  });

  it("omits reply_to and html when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createResendEmailProvider("re_test_key");
    const { replyTo: _replyTo, html: _html, ...rest } = BASE_MESSAGE;
    await provider.send(rest);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.reply_to).toBeUndefined();
    expect(body.html).toBeUndefined();
  });
});

describe("createResendEmailProvider — response mapping", () => {
  it("maps a 200 with an id to accepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_abc" })));
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result).toEqual({ outcome: "accepted", providerMessageId: "email_abc" });
  });

  it("maps a 200 without a usable id to a non-retryable rejection (never silently reports success)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: false });
  });

  it("maps 422 validation error to a permanent (non-retryable) rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(422, { name: "validation_error", message: "bad address" })),
    );
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: false });
    if (result.outcome === "rejected") {
      expect(result.errorCode).toContain("permanent");
      expect(result.errorCode).toContain("422");
    }
  });

  it("maps 403 (invalid key / unverified domain) to a permanent rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { name: "validation_error", message: "domain not verified" }),
        ),
    );
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: false });
  });

  it("maps 429 rate limit to a retryable (transient) rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(429, { name: "rate_limit_exceeded", message: "too many requests" }),
        ),
    );
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: true });
    if (result.outcome === "rejected") {
      expect(result.errorCode).toContain("transient");
    }
  });

  it("maps 500 server error to a retryable (transient) rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(500, { name: "application_error", message: "unexpected" })),
    );
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: true });
  });

  it("maps a fetch-level network failure to a retryable (transient) rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: true });
    if (result.outcome === "rejected") {
      expect(result.errorCode).toContain("network_error");
    }
  });

  it("handles a non-JSON error body without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>gateway error</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const provider = createResendEmailProvider("re_test_key");
    const result = await provider.send(BASE_MESSAGE);
    expect(result.outcome).toBe("rejected");
    expect(result).toMatchObject({ retryable: true });
  });
});
