import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE,
  DEFAULT_STALE_PROCESSING_MINUTES,
  FOLLOWUP_STEP_OFFSET_HOURS,
  FOLLOWUP_STEPS,
  MAX_FOLLOWUP_STEPS,
  computeScheduledFor,
  getFollowupTemplate,
  isStaleProcessing,
  parsePositiveIntEnv,
  shouldScheduleSequence,
  shouldSendFollowup,
} from "./followup-rules";

describe("MAX_FOLLOWUP_STEPS / FOLLOWUP_STEPS", () => {
  it("is exactly 3, per CLAUDE.md's follow-up rule", () => {
    expect(MAX_FOLLOWUP_STEPS).toBe(3);
    expect(FOLLOWUP_STEPS).toEqual([1, 2, 3]);
  });
});

describe("computeScheduledFor", () => {
  const origin = new Date("2026-08-08T12:00:00.000Z");

  it("step 1 is 24h after the origin", () => {
    expect(computeScheduledFor(origin, 1).toISOString()).toBe("2026-08-09T12:00:00.000Z");
  });

  it("step 2 is 72h after the origin (24h + a further 48h)", () => {
    expect(computeScheduledFor(origin, 2).toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });

  it("step 3 is 144h after the origin (72h + a further 72h)", () => {
    expect(computeScheduledFor(origin, 3).toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("offsets are strictly increasing (no step schedules earlier than an earlier step)", () => {
    const offsets = FOLLOWUP_STEPS.map((s) => FOLLOWUP_STEP_OFFSET_HOURS[s]);
    expect(offsets[0]).toBeLessThan(offsets[1]);
    expect(offsets[1]).toBeLessThan(offsets[2]);
  });

  it("never mutates the origin Date passed in", () => {
    const before = origin.getTime();
    computeScheduledFor(origin, 3);
    expect(origin.getTime()).toBe(before);
  });
});

describe("getFollowupTemplate", () => {
  it("returns a distinct, non-empty string for each of the 3 steps", () => {
    const texts = FOLLOWUP_STEPS.map(getFollowupTemplate);
    expect(new Set(texts).size).toBe(3);
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("step 3's text signals this is the last automated message", () => {
    expect(getFollowupTemplate(3)).toMatch(/letzte/i);
  });

  it("templates read as calm/professional, not pushy — no multi-exclamation urgency, no artificial-urgency wording", () => {
    for (const step of FOLLOWUP_STEPS) {
      const text = getFollowupTemplate(step);
      // A single friendly "Hallo!" is fine (matches the product's existing
      // greeting tone) — "!!" or more is the actual aggressive-tone signal.
      expect(text).not.toMatch(/!{2,}/);
      expect(text.toLowerCase()).not.toMatch(/\bjetzt\b|\bsofort\b|\bdringend\b|\bletzte chance\b/);
    }
  });
});

describe("shouldScheduleSequence", () => {
  it("schedules a fresh sequence for an open conversation with no prior follow-ups", () => {
    expect(
      shouldScheduleSequence({ conversationStatus: "open", existingFollowupCount: 0 }),
    ).toEqual({
      schedule: true,
    });
  });

  it("never schedules for a closed conversation", () => {
    expect(
      shouldScheduleSequence({ conversationStatus: "closed", existingFollowupCount: 0 }),
    ).toEqual({ schedule: false, reason: "conversation_closed" });
  });

  it("never schedules a second sequence once any follow-up row already exists (lifetime cap, not per-episode)", () => {
    expect(
      shouldScheduleSequence({ conversationStatus: "open", existingFollowupCount: 1 }),
    ).toEqual({
      schedule: false,
      reason: "sequence_already_exists",
    });
    expect(
      shouldScheduleSequence({ conversationStatus: "open", existingFollowupCount: 3 }),
    ).toEqual({
      schedule: false,
      reason: "sequence_already_exists",
    });
  });

  it("closed status takes precedence over an already-existing sequence when both are true", () => {
    expect(
      shouldScheduleSequence({ conversationStatus: "closed", existingFollowupCount: 2 }),
    ).toEqual({ schedule: false, reason: "conversation_closed" });
  });
});

describe("shouldSendFollowup", () => {
  it("sends when the conversation is open and the lead hasn't replied since scheduling", () => {
    expect(
      shouldSendFollowup({ conversationStatus: "open", hasLeadReplySinceOrigin: false }),
    ).toEqual({ send: true });
  });

  it("never sends once the conversation is closed", () => {
    expect(
      shouldSendFollowup({ conversationStatus: "closed", hasLeadReplySinceOrigin: false }),
    ).toEqual({ send: false, reason: "conversation_closed" });
  });

  it("never sends once the lead has replied since scheduling", () => {
    expect(
      shouldSendFollowup({ conversationStatus: "open", hasLeadReplySinceOrigin: true }),
    ).toEqual({ send: false, reason: "lead_replied" });
  });

  it("closed status takes precedence over a lead reply when both are true", () => {
    expect(
      shouldSendFollowup({ conversationStatus: "closed", hasLeadReplySinceOrigin: true }),
    ).toEqual({ send: false, reason: "conversation_closed" });
  });
});

describe("isStaleProcessing", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("is not stale when updated just now", () => {
    expect(isStaleProcessing(now, now, DEFAULT_STALE_PROCESSING_MINUTES)).toBe(false);
  });

  it("is not stale just under the threshold", () => {
    const updatedAt = new Date(now.getTime() - (DEFAULT_STALE_PROCESSING_MINUTES * 60_000 - 1000));
    expect(isStaleProcessing(updatedAt, now, DEFAULT_STALE_PROCESSING_MINUTES)).toBe(false);
  });

  it("is stale just over the threshold", () => {
    const updatedAt = new Date(now.getTime() - (DEFAULT_STALE_PROCESSING_MINUTES * 60_000 + 1000));
    expect(isStaleProcessing(updatedAt, now, DEFAULT_STALE_PROCESSING_MINUTES)).toBe(true);
  });

  it("respects a custom threshold", () => {
    const updatedAt = new Date(now.getTime() - 2 * 60_000);
    expect(isStaleProcessing(updatedAt, now, 1)).toBe(true);
    expect(isStaleProcessing(updatedAt, now, 5)).toBe(false);
  });
});

describe("parsePositiveIntEnv", () => {
  it("returns the fallback for undefined/missing input", () => {
    expect(parsePositiveIntEnv(undefined, DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE)).toBe(
      DEFAULT_FOLLOWUP_WORKER_BATCH_SIZE,
    );
  });

  it("returns the fallback for an empty string", () => {
    expect(parsePositiveIntEnv("", 50)).toBe(50);
  });

  it("parses a valid positive integer string", () => {
    expect(parsePositiveIntEnv("25", 50)).toBe(25);
  });

  it("returns the fallback for zero or negative values — never a silently empty batch", () => {
    expect(parsePositiveIntEnv("0", 50)).toBe(50);
    expect(parsePositiveIntEnv("-5", 50)).toBe(50);
  });

  it("returns the fallback for non-numeric garbage instead of throwing", () => {
    expect(parsePositiveIntEnv("not-a-number", 50)).toBe(50);
    expect(parsePositiveIntEnv("NaN", 50)).toBe(50);
  });

  it("truncates a decimal to its integer part (parseInt semantics), not the fallback", () => {
    expect(parsePositiveIntEnv("25.7", 50)).toBe(25);
  });
});
