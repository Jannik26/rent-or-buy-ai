import { describe, expect, it } from "vitest";
import {
  computeConversionRate,
  computeFunnel,
  computeTrend,
  dayBucketKey,
  enumerateDayBuckets,
  formatAvgScore,
  formatRate,
  getWindowBounds,
} from "./analytics-rules";

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("getWindowBounds", () => {
  it("7d: start is exactly 7 days before now, previous window is the 7 days before that", () => {
    const b = getWindowBounds("7d", NOW);
    expect(b.end).toEqual(NOW);
    expect(b.start.toISOString()).toBe("2026-08-08T12:00:00.000Z");
    expect(b.previousEnd?.toISOString()).toBe("2026-08-08T12:00:00.000Z");
    expect(b.previousStart?.toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });

  it("30d and 90d scale the same way", () => {
    const b30 = getWindowBounds("30d", NOW);
    expect(NOW.getTime() - b30.start.getTime()).toBe(30 * 86_400_000);
    expect(b30.previousStart!.getTime()).toBe(b30.start.getTime() - 30 * 86_400_000);

    const b90 = getWindowBounds("90d", NOW);
    expect(NOW.getTime() - b90.start.getTime()).toBe(90 * 86_400_000);
  });

  it("all: no previous window at all (null, not zero-length)", () => {
    const b = getWindowBounds("all", NOW);
    expect(b.previousStart).toBeNull();
    expect(b.previousEnd).toBeNull();
    expect(b.start.getTime()).toBeLessThan(NOW.getTime());
  });

  it("previous window never overlaps the current window", () => {
    for (const preset of ["7d", "30d", "90d"] as const) {
      const b = getWindowBounds(preset, NOW);
      expect(b.previousEnd!.getTime()).toBe(b.start.getTime());
      expect(b.previousStart!.getTime()).toBeLessThan(b.previousEnd!.getTime());
    }
  });
});

describe("computeTrend", () => {
  it("unavailable when there is no previous period at all (null)", () => {
    expect(computeTrend(42, null)).toEqual({ kind: "unavailable", deltaPct: null, label: "—" });
  });

  it("flat/no-data when both periods are zero — never a percentage", () => {
    expect(computeTrend(0, 0)).toEqual({ kind: "flat", deltaPct: null, label: "—" });
  });

  it("'Neu' when previous was zero but current is not — never +Infinity%", () => {
    const t = computeTrend(5, 0);
    expect(t.kind).toBe("new");
    expect(t.deltaPct).toBeNull();
    expect(t.label).toBe("Neu");
  });

  it("computes a positive percentage change", () => {
    const t = computeTrend(12, 10);
    expect(t.kind).toBe("up");
    expect(t.deltaPct).toBe(20);
    expect(t.label).toBe("+20%");
  });

  it("computes a negative percentage change", () => {
    const t = computeTrend(8, 10);
    expect(t.kind).toBe("down");
    expect(t.deltaPct).toBe(-20);
    expect(t.label).toBe("-20%");
  });

  it("flat when unchanged and previous > 0", () => {
    const t = computeTrend(10, 10);
    expect(t.kind).toBe("flat");
    expect(t.deltaPct).toBe(0);
    expect(t.label).toBe("0%");
  });
});

describe("computeConversionRate", () => {
  it("returns null (not 0%) when the cohort is empty", () => {
    expect(computeConversionRate(0, 0)).toBeNull();
  });

  it("computes a percentage against the cohort denominator", () => {
    expect(computeConversionRate(3, 12)).toBe(25);
  });

  it("handles a full-conversion cohort", () => {
    expect(computeConversionRate(4, 4)).toBe(100);
  });

  it("numerator can never exceed denominator in practice, but the function doesn't need to assume that", () => {
    expect(computeConversionRate(2, 5)).toBe(40);
  });
});

describe("formatRate / formatAvgScore", () => {
  it("formatRate renders null as an em dash, not '0%' or 'NaN%'", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(87)).toBe("87%");
  });

  it("formatAvgScore renders null as an em dash and rounds otherwise", () => {
    expect(formatAvgScore(null)).toBe("—");
    expect(formatAvgScore(41.6)).toBe("42");
    expect(formatAvgScore(0)).toBe("0");
  });
});

describe("computeFunnel", () => {
  it("returns the three fixed stages in order with the given counts", () => {
    const stages = computeFunnel({
      leadsInWindow: 20,
      qualifiziertOrTerminInWindow: 8,
      leadsWithRealAppointmentInWindow: 3,
    });
    expect(stages.map((s) => s.key)).toEqual(["leads", "qualifiziert", "termin"]);
    expect(stages.map((s) => s.count)).toEqual([20, 8, 3]);
  });

  it("handles an all-zero cohort without error", () => {
    const stages = computeFunnel({
      leadsInWindow: 0,
      qualifiziertOrTerminInWindow: 0,
      leadsWithRealAppointmentInWindow: 0,
    });
    expect(stages.every((s) => s.count === 0)).toBe(true);
  });
});

describe("dayBucketKey", () => {
  it("extracts the UTC calendar day from an ISO timestamp", () => {
    expect(dayBucketKey("2026-08-15T23:59:59.999Z")).toBe("2026-08-15");
    expect(dayBucketKey("2026-08-15T00:00:00.000Z")).toBe("2026-08-15");
  });
});

describe("enumerateDayBuckets", () => {
  it("includes both endpoints' calendar days", () => {
    const days = enumerateDayBuckets(
      new Date("2026-08-01T15:00:00Z"),
      new Date("2026-08-03T02:00:00Z"),
    );
    expect(days).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("a same-day range returns exactly one bucket", () => {
    const days = enumerateDayBuckets(
      new Date("2026-08-01T01:00:00Z"),
      new Date("2026-08-01T23:00:00Z"),
    );
    expect(days).toEqual(["2026-08-01"]);
  });

  it("throws instead of silently producing a huge array for a multi-year range", () => {
    expect(() =>
      enumerateDayBuckets(new Date("2020-01-01T00:00:00Z"), new Date("2026-08-15T00:00:00Z")),
    ).toThrow();
  });
});
