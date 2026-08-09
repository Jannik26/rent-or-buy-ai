// Pure inbound content extraction (Product Track slice 8B, see
// ROADMAP.md) — turns a Resend Received Email's {text, html} into the
// single plain-text string that becomes the canonical lead message.
// Deliberately small (task instructions: "keine riesige
// E-Mail-Parsing-Engine bauen") — no MIME parsing, no header inspection,
// just the two already-parsed body fields Resend's Receiving API hands
// back.
import EmailReplyParser from "email-reply-parser";

/** `messages.content` has a `char_length(content) <= 8000` CHECK
 * constraint (see the conversations migration) — this mirrors it with a
 * safety margin, not the exact boundary, since JS string length (UTF-16
 * code units) and Postgres char_length can differ by a code unit or two
 * for astral-plane characters (emoji etc.) — not worth exact-matching for
 * an inbound-reply text body. */
const MAX_CONTENT_LENGTH = 7_800;

/** Strips <script>/<style> blocks entirely (never even consider their
 * text content), then every remaining tag, then decodes the handful of
 * HTML entities that actually show up in real email bodies, then
 * collapses whitespace. Not a sanitizer for re-rendering HTML — the
 * output is plain text, stored as `messages.content` and rendered as
 * plain text by the existing Conversations UI (never dangerouslySetInnerHTML),
 * so there is no HTML/XSS surface downstream regardless. */
export function htmlToPlainText(html: string): string {
  const withoutScriptsAndStyles = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScriptsAndStyles
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ExtractedReplyContent =
  | { ok: true; content: string }
  | { ok: false; reason: "empty_after_normalization" };

/** Priority: plain-text body if present and non-empty; otherwise a safe
 * HTML→text reduction (task Phase 9). Either way, quoted-reply trimming
 * (task Phase 10) runs afterward via `email-reply-parser` — a small,
 * zero-dependency, MIT-licensed, actively maintained port of GitHub's own
 * reply-parsing algorithm (not a hand-rolled regex heuristic; deliberately
 * chosen over improvising one, per the task's own guidance). Its quote
 * detection is conservative but not perfect (task Phase 10 explicitly
 * prefers under-trimming over destroying real lead content) — see
 * ROADMAP.md for the documented limitation. Truncates to
 * MAX_CONTENT_LENGTH as a last step; never throws. */
export function extractReplyContent(args: {
  text: string | null;
  html: string | null;
}): ExtractedReplyContent {
  const rawBody = args.text?.trim() ? args.text : args.html ? htmlToPlainText(args.html) : "";
  if (!rawBody.trim()) {
    return { ok: false, reason: "empty_after_normalization" };
  }

  let trimmed: string;
  try {
    trimmed = new EmailReplyParser().parseReply(rawBody).trim();
  } catch {
    // A parsing failure in the quote-trimming library must never lose the
    // reply entirely — fall back to the untrimmed (but still normalized)
    // body rather than an empty/failed result.
    trimmed = rawBody.trim();
  }

  if (!trimmed) {
    return { ok: false, reason: "empty_after_normalization" };
  }

  const content = trimmed.length > MAX_CONTENT_LENGTH ? trimmed.slice(0, MAX_CONTENT_LENGTH) : trimmed;
  return { ok: true, content };
}
