import { describe, expect, it } from "vitest";
import {
  FeedbackAnalysisOutputSchema,
  overrideFeedbackAnalysisSchema,
  resolveEffectiveCategory,
  resolveEffectivePriority,
  submitFeedbackSchema,
  updateFeedbackStatusSchema,
} from "@/lib/feedback/feedback-rules";

describe("submitFeedbackSchema", () => {
  it("accepts a normal feedback text", () => {
    expect(submitFeedbackSchema.parse({ content: "Bulk rescheduling wäre super." })).toEqual({
      content: "Bulk rescheduling wäre super.",
    });
  });

  it("rejects empty content", () => {
    expect(() => submitFeedbackSchema.parse({ content: "" })).toThrow();
    expect(() => submitFeedbackSchema.parse({ content: "   " })).toThrow();
  });

  it("rejects content over 4000 characters", () => {
    expect(() => submitFeedbackSchema.parse({ content: "x".repeat(4001) })).toThrow();
  });

  it("accepts exactly 4000 characters", () => {
    expect(submitFeedbackSchema.parse({ content: "x".repeat(4000) }).content).toHaveLength(4000);
  });
});

describe("updateFeedbackStatusSchema", () => {
  it("accepts every valid status", () => {
    for (const status of ["new", "reviewed", "planned", "resolved", "dismissed"] as const) {
      expect(() =>
        updateFeedbackStatusSchema.parse({
          feedbackItemId: "99999999-9999-9999-9999-999999999999",
          status,
        }),
      ).not.toThrow();
    }
  });

  it("rejects an invalid status", () => {
    expect(() =>
      updateFeedbackStatusSchema.parse({
        feedbackItemId: "99999999-9999-9999-9999-999999999999",
        status: "archived",
      }),
    ).toThrow();
  });

  it("rejects a malformed feedback item id", () => {
    expect(() =>
      updateFeedbackStatusSchema.parse({ feedbackItemId: "not-a-uuid", status: "new" }),
    ).toThrow();
  });
});

describe("overrideFeedbackAnalysisSchema", () => {
  const id = "99999999-9999-9999-9999-999999999999";

  it("accepts a category-only override", () => {
    expect(() =>
      overrideFeedbackAnalysisSchema.parse({ feedbackItemId: id, categoryOverride: "bug" }),
    ).not.toThrow();
  });

  it("accepts a priority-only override, including 'critical' (human-only value)", () => {
    expect(() =>
      overrideFeedbackAnalysisSchema.parse({ feedbackItemId: id, priorityOverride: "critical" }),
    ).not.toThrow();
  });

  it("accepts clearing an override via null", () => {
    expect(() =>
      overrideFeedbackAnalysisSchema.parse({ feedbackItemId: id, categoryOverride: null }),
    ).not.toThrow();
  });

  it("rejects a call with neither field present (no-op)", () => {
    expect(() => overrideFeedbackAnalysisSchema.parse({ feedbackItemId: id })).toThrow();
  });

  it("rejects an invalid category value", () => {
    expect(() =>
      overrideFeedbackAnalysisSchema.parse({ feedbackItemId: id, categoryOverride: "made_up" }),
    ).toThrow();
  });
});

describe("FeedbackAnalysisOutputSchema (AI output validation)", () => {
  const valid = {
    category: "feature_request",
    sentiment: "neutral",
    summary: "Bulk rescheduling for appointments",
    suggested_priority: "medium",
    confidence: 0.8,
  };

  it("accepts a well-formed AI response", () => {
    expect(() => FeedbackAnalysisOutputSchema.parse(valid)).not.toThrow();
  });

  it("accepts a null sentiment/confidence", () => {
    expect(() =>
      FeedbackAnalysisOutputSchema.parse({ ...valid, sentiment: null, confidence: null }),
    ).not.toThrow();
  });

  it("rejects 'critical' as a suggested_priority — the AI schema cannot even represent it", () => {
    expect(() =>
      FeedbackAnalysisOutputSchema.parse({ ...valid, suggested_priority: "critical" }),
    ).toThrow();
  });

  it("rejects an invented category not in the controlled vocabulary", () => {
    expect(() =>
      FeedbackAnalysisOutputSchema.parse({ ...valid, category: "invented_category" }),
    ).toThrow();
  });

  it("rejects a confidence outside 0-1", () => {
    expect(() => FeedbackAnalysisOutputSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
    expect(() => FeedbackAnalysisOutputSchema.parse({ ...valid, confidence: -0.1 })).toThrow();
  });

  it("rejects a summary over 500 characters", () => {
    expect(() =>
      FeedbackAnalysisOutputSchema.parse({ ...valid, summary: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects malformed/garbage AI output entirely (missing required fields)", () => {
    expect(() => FeedbackAnalysisOutputSchema.parse({ foo: "bar" })).toThrow();
    expect(() => FeedbackAnalysisOutputSchema.parse("not even an object")).toThrow();
    expect(() => FeedbackAnalysisOutputSchema.parse(null)).toThrow();
  });
});

describe("resolveEffectiveCategory", () => {
  it("prefers the human override over the AI category", () => {
    expect(
      resolveEffectiveCategory({ category_override: "bug", ai_category: "feature_request" }),
    ).toEqual({
      value: "bug",
      source: "human",
    });
  });

  it("falls back to the AI category when there is no override", () => {
    expect(resolveEffectiveCategory({ category_override: null, ai_category: "ux" })).toEqual({
      value: "ux",
      source: "ai",
    });
  });

  it("returns none when neither is present (analysis still pending/failed)", () => {
    expect(resolveEffectiveCategory({ category_override: null, ai_category: null })).toEqual({
      value: null,
      source: "none",
    });
  });
});

describe("resolveEffectivePriority", () => {
  it("prefers the human override, including a 'critical' value the AI could never have suggested", () => {
    expect(
      resolveEffectivePriority({ priority_override: "critical", ai_suggested_priority: "low" }),
    ).toEqual({ value: "critical", source: "human" });
  });

  it("falls back to the AI suggestion when there is no override", () => {
    expect(
      resolveEffectivePriority({ priority_override: null, ai_suggested_priority: "high" }),
    ).toEqual({
      value: "high",
      source: "ai",
    });
  });

  it("returns none when neither is present", () => {
    expect(
      resolveEffectivePriority({ priority_override: null, ai_suggested_priority: null }),
    ).toEqual({
      value: null,
      source: "none",
    });
  });

  it("a later AI analysis can never silently overwrite a human override (structural, not just tested here) — this test documents the resolution contract that guarantees it", () => {
    // The override field and the AI field are two independent inputs to
    // this pure function — updating one (a new feedback_analyses row
    // changing ai_suggested_priority) never changes the other
    // (priority_override, which only a human-triggered call ever writes).
    const humanOverridden = resolveEffectivePriority({
      priority_override: "high",
      ai_suggested_priority: "low",
    });
    const afterHypotheticalNewAiRun = resolveEffectivePriority({
      priority_override: "high",
      ai_suggested_priority: "medium",
    });
    expect(humanOverridden.value).toBe("high");
    expect(afterHypotheticalNewAiRun.value).toBe("high");
  });
});
