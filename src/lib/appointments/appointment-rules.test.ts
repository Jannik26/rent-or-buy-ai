import { describe, expect, it } from "vitest";
import {
  LEAD_STATUS_ON_CANCEL_FALLBACK,
  LEAD_STATUS_ON_SCHEDULE,
  cancelAppointmentSchema,
  createAppointmentSchema,
  dateTimeLocalValueToIso,
  isValidIsoDate,
  isoToDateTimeLocalValue,
  restoreAppointmentSchema,
  updateAppointmentSchema,
} from "./appointment-rules";

const VALID_LEAD_ID = "11111111-1111-1111-1111-111111111111";
const VALID_APPOINTMENT_ID = "22222222-2222-2222-2222-222222222222";

describe("isValidIsoDate", () => {
  it("accepts a valid ISO datetime string", () => {
    expect(isValidIsoDate("2026-09-01T10:00:00.000Z")).toBe(true);
  });

  it("rejects garbage strings", () => {
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("createAppointmentSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full valid input with endsAt after startsAt", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T11:00:00.000Z",
      location: "Musterstraße 1, 12345 Berlin",
      notes: "Zweitbesichtigung, Schlüssel beim Hausmeister.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid leadId", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "not-a-uuid",
      startsAt: "2026-09-01T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid startsAt", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "next tuesday",
    });
    expect(result.success).toBe(false);
  });

  it("rejects endsAt at or before startsAt", () => {
    const sameInstant = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:00:00.000Z",
    });
    expect(sameInstant.success).toBe(false);

    const before = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T09:00:00.000Z",
    });
    expect(before.success).toBe(false);
  });

  it("rejects a location or notes string over the length limit", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
      location: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("trims location and notes", () => {
    const result = createAppointmentSchema.parse({
      leadId: VALID_LEAD_ID,
      startsAt: "2026-09-01T10:00:00.000Z",
      location: "  Musterstraße 1  ",
      notes: "  Anmerkung  ",
    });
    expect(result.location).toBe("Musterstraße 1");
    expect(result.notes).toBe("Anmerkung");
  });
});

describe("updateAppointmentSchema", () => {
  it("accepts a partial update with only notes", () => {
    const result = updateAppointmentSchema.safeParse({
      appointmentId: VALID_APPOINTMENT_ID,
      notes: "Termin verschoben auf Wunsch des Kunden.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full reschedule", () => {
    const result = updateAppointmentSchema.safeParse({
      appointmentId: VALID_APPOINTMENT_ID,
      startsAt: "2026-09-05T09:00:00.000Z",
      endsAt: "2026-09-05T09:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endsAt before the new startsAt when both are given", () => {
    const result = updateAppointmentSchema.safeParse({
      appointmentId: VALID_APPOINTMENT_ID,
      startsAt: "2026-09-05T09:00:00.000Z",
      endsAt: "2026-09-05T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid appointmentId", () => {
    const result = updateAppointmentSchema.safeParse({
      appointmentId: "not-a-uuid",
      notes: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("cancelAppointmentSchema / restoreAppointmentSchema", () => {
  it("accepts a bare cancel with no revertLeadStatusTo", () => {
    const result = cancelAppointmentSchema.safeParse({ appointmentId: VALID_APPOINTMENT_ID });
    expect(result.success).toBe(true);
  });

  it("accepts a cancel carrying the captured previous lead status", () => {
    const result = cancelAppointmentSchema.safeParse({
      appointmentId: VALID_APPOINTMENT_ID,
      revertLeadStatusTo: "qualifiziert",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a restore input", () => {
    const result = restoreAppointmentSchema.safeParse({ appointmentId: VALID_APPOINTMENT_ID });
    expect(result.success).toBe(true);
  });

  it("rejects a missing appointmentId", () => {
    expect(cancelAppointmentSchema.safeParse({}).success).toBe(false);
    expect(restoreAppointmentSchema.safeParse({}).success).toBe(false);
  });
});

describe("isoToDateTimeLocalValue / dateTimeLocalValueToIso", () => {
  it("round-trips a datetime-local value through an ISO timestamp", () => {
    const local = "2026-09-01T10:30";
    const iso = dateTimeLocalValueToIso(local);
    expect(iso).not.toBeNull();
    expect(isoToDateTimeLocalValue(iso!)).toBe(local);
  });

  it("returns null for an empty or unparseable datetime-local value", () => {
    expect(dateTimeLocalValueToIso("")).toBeNull();
    expect(dateTimeLocalValueToIso("not-a-date")).toBeNull();
  });

  it("pads single-digit month/day/hour/minute (round trip, timezone-independent)", () => {
    const local = "2026-01-02T03:04";
    expect(isoToDateTimeLocalValue(dateTimeLocalValueToIso(local)!)).toBe(local);
  });
});

describe("lead status mapping constants", () => {
  it("schedule always maps to 'termin', cancel fallback always to 'neu' — matches the pre-existing toggle exactly", () => {
    expect(LEAD_STATUS_ON_SCHEDULE).toBe("termin");
    expect(LEAD_STATUS_ON_CANCEL_FALLBACK).toBe("neu");
  });
});
