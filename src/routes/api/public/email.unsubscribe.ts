// Public, no-login unsubscribe endpoint (Product Track slice 8A, see
// ROADMAP.md) — the target of both the visible footer link in every
// follow-up email and the List-Unsubscribe-Post one-click header (RFC
// 8058). Deliberately two different flows on the same URL:
//
//   - GET (a human clicking the link in the email body): shows a small
//     confirmation page with a button, does NOT mutate anything yet.
//     Real-world reason, not theoretical: email security scanners and
//     some mail clients "pre-fetch"/follow links in an inbox to check for
//     malware, which would silently unsubscribe a lead who never clicked
//     anything if GET itself mutated state.
//   - POST (either the confirm button's form submit, or a mail client's
//     own one-click-unsubscribe UI hitting List-Unsubscribe-Post):
//     applies the suppression immediately, no further confirmation. RFC
//     8058 explicitly expects this — the mail client only sends this POST
//     after the user already took an explicit unsubscribe action in the
//     client's own UI, so a second confirmation step there would be
//     redundant, not safer.
//
// Both paths share one token-verification + suppression call — no
// duplicated logic between them.
import { createFileRoute } from "@tanstack/react-router";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { addSuppression } from "@/lib/email/suppression";

function htmlResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const PAGE_STYLE =
  "margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0B1F3A;";
const CARD_STYLE =
  "max-width:420px;margin:64px auto;background:#ffffff;border-radius:8px;padding:32px;text-align:center;";
const BUTTON_STYLE =
  "display:inline-block;margin-top:16px;padding:10px 20px;background:#0B1F3A;color:#ffffff;border:none;border-radius:6px;font-size:15px;cursor:pointer;text-decoration:none;";

function renderPage(args: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${args.title}</title>
    <meta name="robots" content="noindex" />
  </head>
  <body style="${PAGE_STYLE}">
    <div style="${CARD_STYLE}">${args.body}</div>
  </body>
</html>`;
}

function invalidTokenPage(): string {
  // Deliberately generic — never explains *why* a token is invalid
  // (malformed vs. wrong signature vs. tampered), which would only help
  // someone probing the endpoint.
  return renderPage({
    title: "Link ungültig — EstateAI",
    body: `<p style="font-size:15px;line-height:1.6;">Dieser Link ist ungültig oder nicht mehr aktuell. Falls Sie keine automatischen E-Mails mehr erhalten möchten, antworten Sie bitte auf eine der erhaltenen Nachrichten.</p>`,
  });
}

function confirmPage(token: string): string {
  const encodedToken = encodeURIComponent(token);
  return renderPage({
    title: "Automatische E-Mails beenden — EstateAI",
    body: `
      <p style="font-size:15px;line-height:1.6;">Möchten Sie keine weiteren automatischen Follow-up-E-Mails mehr erhalten?</p>
      <form method="POST" action="/api/public/email/unsubscribe?token=${encodedToken}">
        <button type="submit" style="${BUTTON_STYLE}">Ja, automatische Nachrichten stoppen</button>
      </form>`,
  });
}

function successPage(): string {
  return renderPage({
    title: "Erledigt — EstateAI",
    body: `<p style="font-size:15px;line-height:1.6;">Automatische Follow-up-E-Mails wurden beendet. Sie erhalten von uns keine weiteren automatischen Nachrichten mehr zu dieser Anfrage.</p>`,
  });
}

async function applyUnsubscribe(token: string): Promise<{ ok: boolean }> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) return { ok: false }; // fail closed — never guess/skip verification
  const result = verifyUnsubscribeToken(token, secret);
  if (!result.ok) return { ok: false };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await addSuppression(supabaseAdmin, {
    companyId: result.payload.companyId,
    email: result.payload.email,
    reason: "unsubscribe",
  });
  await supabaseAdmin.from("system_events").insert({
    kind: "success",
    source: "email.unsubscribe",
    message: "recipient unsubscribed",
    context: { companyId: result.payload.companyId },
  });
  return { ok: true };
}

export async function handleUnsubscribeGet(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return htmlResponse(invalidTokenPage(), 400);

  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) return htmlResponse(invalidTokenPage(), 401);

  const result = verifyUnsubscribeToken(token, secret);
  if (!result.ok) return htmlResponse(invalidTokenPage(), 400);

  // Valid token, no mutation yet — see module doc comment for why GET
  // never mutates.
  return htmlResponse(confirmPage(token), 200);
}

export async function handleUnsubscribePost(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return htmlResponse(invalidTokenPage(), 400);

  const { ok } = await applyUnsubscribe(token);
  if (!ok) return htmlResponse(invalidTokenPage(), 400);

  // Idempotent by construction (addSuppression upserts, see
  // suppression.ts) — a repeated click, a repeated one-click-unsubscribe
  // POST from a mail client, or a retried request all land here safely.
  return htmlResponse(successPage(), 200);
}

export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => handleUnsubscribeGet(request),
      POST: async ({ request }) => handleUnsubscribePost(request),
    },
  },
});
