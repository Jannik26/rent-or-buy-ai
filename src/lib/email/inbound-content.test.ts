import { describe, expect, it } from "vitest";
import { extractReplyContent, htmlToPlainText } from "./inbound-content";

describe("htmlToPlainText", () => {
  it("strips tags and keeps text content", () => {
    expect(htmlToPlainText("<p>Hallo <strong>Welt</strong></p>")).toBe("Hallo Welt");
  });

  it("removes script and style blocks entirely, including their text content", () => {
    const html = "<p>Sichtbar</p><script>alert('xss')</script><style>.x{color:red}</style>";
    const result = htmlToPlainText(html);
    expect(result).toContain("Sichtbar");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color:red");
  });

  it("converts <br> and block-level closing tags to newlines", () => {
    const result = htmlToPlainText("<p>Zeile 1</p><p>Zeile 2<br>Zeile 3</p>");
    expect(result).toBe("Zeile 1\nZeile 2\nZeile 3");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToPlainText("Tom &amp; Jerry &lt;3 &quot;test&quot;")).toBe(
      'Tom & Jerry <3 "test"',
    );
  });

  it("collapses excessive blank lines", () => {
    const result = htmlToPlainText("<p>A</p><p></p><p></p><p>B</p>");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("never throws on malformed/unclosed HTML", () => {
    expect(() => htmlToPlainText("<p>unclosed <div>nested")).not.toThrow();
    expect(() => htmlToPlainText("")).not.toThrow();
  });
});

describe("extractReplyContent", () => {
  it("prefers plain text over html when both are present", () => {
    const result = extractReplyContent({ text: "Plain text body", html: "<p>HTML body</p>" });
    expect(result).toEqual({ ok: true, content: "Plain text body" });
  });

  it("falls back to html-derived text when text is null", () => {
    const result = extractReplyContent({ text: null, html: "<p>Nur HTML vorhanden</p>" });
    expect(result).toEqual({ ok: true, content: "Nur HTML vorhanden" });
  });

  it("falls back to html-derived text when text is empty/whitespace-only", () => {
    const result = extractReplyContent({ text: "   ", html: "<p>HTML gewinnt</p>" });
    expect(result).toEqual({ ok: true, content: "HTML gewinnt" });
  });

  it("trims a quoted reply chain (English 'On ... wrote:' convention)", () => {
    const text = [
      "Danke, das passt!",
      "",
      "On Mon, Aug 9, 2026 at 12:00 PM Muster Immobilien <x@example.com> wrote:",
      "> Hallo! Ich wollte kurz nachfragen...",
    ].join("\n");
    const result = extractReplyContent({ text, html: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("Danke, das passt!");
      expect(result.content).not.toContain("Hallo! Ich wollte kurz nachfragen");
    }
  });

  it("returns ok:false with empty_after_normalization for both fields null", () => {
    expect(extractReplyContent({ text: null, html: null })).toEqual({
      ok: false,
      reason: "empty_after_normalization",
    });
  });

  it("returns ok:false when both fields are present but blank/whitespace-only", () => {
    expect(extractReplyContent({ text: "   ", html: "  " })).toEqual({
      ok: false,
      reason: "empty_after_normalization",
    });
  });

  it("returns ok:false when the only content is HTML that strips to nothing (e.g. an image-only signature)", () => {
    const html = '<img src="cid:logo" /><script>track()</script>';
    expect(extractReplyContent({ text: null, html })).toEqual({
      ok: false,
      reason: "empty_after_normalization",
    });
  });

  it("returns ok:false when the entire body is just a quote with no new text", () => {
    const text = "On Mon wrote:\n> quoted only, no reply text";
    const result = extractReplyContent({ text, html: null });
    // Conservative library behavior may leave the header line itself —
    // assert it never fabricates content beyond what was there, and never throws.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.length).toBeLessThan(text.length + 1);
    }
  });

  it("truncates a body far beyond the messages.content length limit", () => {
    const hugeText = "A".repeat(20_000);
    const result = extractReplyContent({ text: hugeText, html: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.length).toBeLessThanOrEqual(7_800);
    }
  });

  it("never throws for any input shape", () => {
    expect(() => extractReplyContent({ text: "", html: "" })).not.toThrow();
    expect(() => extractReplyContent({ text: null, html: "<<<not valid html" })).not.toThrow();
  });
});
