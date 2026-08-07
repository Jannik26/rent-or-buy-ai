import { describe, expect, it } from "vitest";
import {
  getConversationActivityAt,
  getLastMessage,
  matchesScoreFilter,
  matchesSearch,
  matchesStatusFilter,
  normalizeMessage,
  normalizeMessages,
  sortConversationsByActivity,
  truncatePreview,
} from "./conversation-rules";

describe("normalizeMessage", () => {
  it("passes through a well-formed user/assistant message", () => {
    expect(normalizeMessage({ role: "user", content: "Hallo" })).toEqual({
      role: "user",
      content: "Hallo",
    });
    expect(normalizeMessage({ role: "assistant", content: "Willkommen" })).toEqual({
      role: "assistant",
      content: "Willkommen",
    });
  });

  it("degrades an unrecognized role to 'unknown' instead of misattributing it", () => {
    expect(normalizeMessage({ role: "system", content: "x" }).role).toBe("unknown");
    expect(normalizeMessage({ role: "tool", content: "x" }).role).toBe("unknown");
    expect(normalizeMessage({ content: "no role field" }).role).toBe("unknown");
  });

  it("never invents content for a missing or non-string content field", () => {
    expect(normalizeMessage({ role: "user" }).content).toBe("");
    expect(normalizeMessage({ role: "user", content: 42 }).content).toBe("");
    expect(normalizeMessage({ role: "user", content: null }).content).toBe("");
  });

  it("handles completely malformed entries (null, primitives, arrays) without throwing", () => {
    expect(normalizeMessage(null)).toEqual({ role: "unknown", content: "" });
    expect(normalizeMessage(undefined)).toEqual({ role: "unknown", content: "" });
    expect(normalizeMessage("just a string")).toEqual({ role: "unknown", content: "" });
    expect(normalizeMessage(42)).toEqual({ role: "unknown", content: "" });
    expect(normalizeMessage([1, 2, 3])).toEqual({ role: "unknown", content: "" });
  });
});

describe("normalizeMessages", () => {
  it("maps a well-formed array", () => {
    const result = normalizeMessages([
      { role: "assistant", content: "Hallo" },
      { role: "user", content: "Hi" },
    ]);
    expect(result).toEqual([
      { role: "assistant", content: "Hallo" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("returns an empty array for null, undefined, or a non-array legacy shape", () => {
    expect(normalizeMessages(null)).toEqual([]);
    expect(normalizeMessages(undefined)).toEqual([]);
    expect(normalizeMessages({ role: "user", content: "not an array" })).toEqual([]);
    expect(normalizeMessages("legacy string blob")).toEqual([]);
  });

  it("normalizes each element independently — one malformed entry doesn't break the rest", () => {
    const result = normalizeMessages([
      { role: "user", content: "gut" },
      "malformed",
      { role: "assistant", content: "auch gut" },
      null,
    ]);
    expect(result).toEqual([
      { role: "user", content: "gut" },
      { role: "unknown", content: "" },
      { role: "assistant", content: "auch gut" },
      { role: "unknown", content: "" },
    ]);
  });
});

describe("getLastMessage", () => {
  it("returns the last element of a non-empty conversation", () => {
    const messages = normalizeMessages([
      { role: "assistant", content: "erste" },
      { role: "user", content: "letzte" },
    ]);
    expect(getLastMessage(messages)).toEqual({ role: "user", content: "letzte" });
  });

  it("returns null for an empty conversation, never throws", () => {
    expect(getLastMessage([])).toBeNull();
  });
});

describe("truncatePreview", () => {
  it("returns short text unchanged", () => {
    expect(truncatePreview("Hallo")).toBe("Hallo");
  });

  it("collapses internal whitespace/newlines", () => {
    expect(truncatePreview("Hallo   \n\n  Welt")).toBe("Hallo Welt");
  });

  it("truncates long text with an ellipsis at the given length", () => {
    const text = "a".repeat(200);
    const result = truncatePreview(text, 50);
    expect(result.length).toBe(51); // 50 chars + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("truncating empty text never fabricates content", () => {
    expect(truncatePreview("")).toBe("");
    expect(truncatePreview("   ")).toBe("");
  });
});

describe("getConversationActivityAt", () => {
  it("is the identity function over leads.updated_at (documents the approximation, doesn't hide it)", () => {
    expect(getConversationActivityAt("2026-08-01T00:00:00.000Z")).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("sortConversationsByActivity", () => {
  it("sorts descending by activityAt", () => {
    const list = [
      { leadId: "a", activityAt: "2026-08-01T00:00:00.000Z" },
      { leadId: "b", activityAt: "2026-08-05T00:00:00.000Z" },
      { leadId: "c", activityAt: "2026-08-03T00:00:00.000Z" },
    ];
    expect(sortConversationsByActivity(list).map((c) => c.leadId)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const list = [
      { leadId: "a", activityAt: "2026-08-01T00:00:00.000Z" },
      { leadId: "b", activityAt: "2026-08-05T00:00:00.000Z" },
    ];
    const copy = [...list];
    sortConversationsByActivity(list);
    expect(list).toEqual(copy);
  });

  it("sorts an invalid/unparseable timestamp last instead of throwing", () => {
    const list = [
      { leadId: "bad", activityAt: "not-a-date" },
      { leadId: "good", activityAt: "2026-08-01T00:00:00.000Z" },
    ];
    expect(sortConversationsByActivity(list).map((c) => c.leadId)).toEqual(["good", "bad"]);
  });

  it("handles an empty list", () => {
    expect(sortConversationsByActivity([])).toEqual([]);
  });
});

describe("matchesSearch", () => {
  it("matches a case-insensitive substring of the name", () => {
    expect(matchesSearch("Jan Tim", "jan")).toBe(true);
    expect(matchesSearch("Jan Tim", "TIM")).toBe(true);
    expect(matchesSearch("Jan Tim", "xyz")).toBe(false);
  });

  it("a blank query matches everything, including a null name", () => {
    expect(matchesSearch("Jan Tim", "")).toBe(true);
    expect(matchesSearch("Jan Tim", "   ")).toBe(true);
    expect(matchesSearch(null, "")).toBe(true);
  });

  it("a null name never matches a non-blank query", () => {
    expect(matchesSearch(null, "jan")).toBe(false);
  });
});

describe("matchesStatusFilter / matchesScoreFilter", () => {
  it("'all' matches every value", () => {
    expect(matchesStatusFilter("neu", "all")).toBe(true);
    expect(matchesStatusFilter("termin", "all")).toBe(true);
    expect(matchesScoreFilter("hot", "all")).toBe(true);
  });

  it("a specific filter matches only the exact value", () => {
    expect(matchesStatusFilter("qualifiziert", "qualifiziert")).toBe(true);
    expect(matchesStatusFilter("neu", "qualifiziert")).toBe(false);
    expect(matchesScoreFilter("warm", "warm")).toBe(true);
    expect(matchesScoreFilter("hot", "warm")).toBe(false);
  });
});
