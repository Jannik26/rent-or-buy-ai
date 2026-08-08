import { describe, expect, it } from "vitest";
import {
  computeNewTranscriptTurns,
  mapTranscriptRoleToSenderType,
  matchesScoreFilter,
  matchesSearch,
  matchesStatusFilter,
  sortConversationsByActivity,
  truncatePreview,
} from "./conversation-rules";

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

  it("sorts a null activityAt (conversation with no messages yet) last", () => {
    const list = [
      { leadId: "empty", activityAt: null },
      { leadId: "good", activityAt: "2026-08-01T00:00:00.000Z" },
    ];
    expect(sortConversationsByActivity(list).map((c) => c.leadId)).toEqual(["good", "empty"]);
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

describe("mapTranscriptRoleToSenderType", () => {
  it("maps the two real transcript roles", () => {
    expect(mapTranscriptRoleToSenderType("user")).toBe("lead");
    expect(mapTranscriptRoleToSenderType("assistant")).toBe("ai");
  });

  it("returns null for anything else instead of guessing", () => {
    expect(mapTranscriptRoleToSenderType("system")).toBeNull();
    expect(mapTranscriptRoleToSenderType("tool")).toBeNull();
    expect(mapTranscriptRoleToSenderType("")).toBeNull();
  });
});

describe("computeNewTranscriptTurns", () => {
  const transcript = [
    { role: "assistant", content: "Hallo" },
    { role: "user", content: "Hi" },
    { role: "user", content: "neue Frage" },
    { role: "assistant", content: "neue Antwort" },
  ];

  it("returns only the tail beyond what's already persisted (the normal one-turn case)", () => {
    expect(computeNewTranscriptTurns(transcript, 2)).toEqual([
      { role: "user", content: "neue Frage" },
      { role: "assistant", content: "neue Antwort" },
    ]);
  });

  it("returns the full transcript when nothing is persisted yet (first turn)", () => {
    expect(computeNewTranscriptTurns(transcript, 0)).toEqual(transcript);
  });

  it("returns an empty array when everything is already persisted", () => {
    expect(computeNewTranscriptTurns(transcript, transcript.length)).toEqual([]);
  });

  it("never returns a negative slice for a persisted count beyond the transcript length", () => {
    expect(computeNewTranscriptTurns(transcript, transcript.length + 5)).toEqual([]);
  });

  it("treats a negative persisted count as zero instead of throwing", () => {
    expect(computeNewTranscriptTurns(transcript, -3)).toEqual(transcript);
  });
});
