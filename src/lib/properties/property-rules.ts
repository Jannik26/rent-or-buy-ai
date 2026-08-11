// Pure, unit-tested rules for the Property Domain Model (Product Track
// slice 9, "Property Domain Model + Property Matching V1" — see
// ROADMAP.md and docs/platform-modules.md 5.1). No Supabase I/O here (that
// lives in properties.functions.ts) — mirrors the established pattern in
// src/lib/appointments/appointment-rules.ts and src/lib/billing/
// subscription-status.ts.
import { z } from "zod";

export const PROPERTY_STATUSES = [
  "draft",
  "active",
  "reserved",
  "sold",
  "rented",
  "archived",
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_MARKETING_TYPES = ["kauf", "miete"] as const;
export type PropertyMarketingType = (typeof PROPERTY_MARKETING_TYPES)[number];

// Small, controlled vocabulary (task instructions: "nicht sofort hunderte
// immobilienspezifische Felder bauen") — matches the DB CHECK constraint in
// the migration exactly, kept in one place here so UI/matching never
// invents a category the DB would reject.
export const PROPERTY_TYPES = ["wohnung", "haus", "grundstueck", "gewerbe", "sonstiges"] as const;
export type PropertyTypeValue = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  reserved: "Reserviert",
  sold: "Verkauft",
  rented: "Vermietet",
  archived: "Archiviert",
};

export const PROPERTY_MARKETING_TYPE_LABEL: Record<PropertyMarketingType, string> = {
  kauf: "Kauf",
  miete: "Miete",
};

export const PROPERTY_TYPE_LABEL: Record<PropertyTypeValue, string> = {
  wohnung: "Wohnung",
  haus: "Haus",
  grundstueck: "Grundstück",
  gewerbe: "Gewerbe",
  sonstiges: "Sonstiges",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Field-level building blocks, shared by create/update schemas ----

const titleField = z
  .string()
  .trim()
  .min(1, "Bitte einen Titel angeben.")
  .max(200, "Maximal 200 Zeichen.");
const statusField = z.enum(PROPERTY_STATUSES);
const marketingTypeField = z.enum(PROPERTY_MARKETING_TYPES);
const propertyTypeField = z.enum(PROPERTY_TYPES);

// Accepts a positive number or null/undefined — never negative, never zero
// for area/rooms fields (a 0 m² living area or 0 rooms is not a real value,
// same reasoning as the DB CHECK constraints, kept consistent client-side
// so a form error surfaces before the request even reaches Postgres).
const positiveNumberField = z.number().positive("Muss größer als 0 sein.").nullable().optional();

const nonNegativeMoneyField = z.number().min(0, "Darf nicht negativ sein.").nullable().optional();

const positiveIntField = z
  .number()
  .int("Muss eine ganze Zahl sein.")
  .positive("Muss größer als 0 sein.")
  .nullable()
  .optional();

const optionalTextField = (max: number) => z.string().trim().max(max).nullable().optional();

const requiredTextField = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);

// Deliberately no `.default(...)` anywhere here (even though several of
// these fields — status, country, the has*/is* booleans — have an obvious
// default): a Zod `.default()` makes the schema's *input* type optional
// while its *output* type stays required, which reliably confuses
// react-hook-form's `useForm<PropertyFormValues>` + zodResolver generic
// inference (a real type error hit while wiring PropertyForm.tsx, not a
// hypothetical). The UI layer supplies the same defaults explicitly
// instead (see PropertyForm.tsx's DEFAULT_VALUES) — one, single place for
// "what does a blank property look like", not split across the schema and
// the form.
export const propertyFormSchema = z.object({
  title: titleField,
  status: statusField,
  marketingType: marketingTypeField,
  price: nonNegativeMoneyField,
  propertyType: propertyTypeField,
  street: optionalTextField(200),
  houseNumber: optionalTextField(20),
  postalCode: requiredTextField(20, "Bitte eine PLZ angeben."),
  city: requiredTextField(120, "Bitte eine Stadt angeben."),
  district: optionalTextField(120),
  country: z.string().trim().min(1).max(2),
  livingAreaM2: positiveNumberField,
  plotAreaM2: positiveNumberField,
  rooms: positiveNumberField,
  bedrooms: positiveIntField,
  bathrooms: positiveIntField,
  floor: optionalTextField(50),
  hasBalcony: z.boolean(),
  hasTerrace: z.boolean(),
  hasGarden: z.boolean(),
  hasParking: z.boolean(),
  hasElevator: z.boolean(),
  hasFittedKitchen: z.boolean(),
  isAccessible: z.boolean(),
  description: optionalTextField(4000),
  externalReference: optionalTextField(200),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export const createPropertySchema = propertyFormSchema;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = propertyFormSchema.partial().extend({
  propertyId: z.string().regex(UUID_RE, "Ungültige Objekt-ID."),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const archivePropertySchema = z.object({
  propertyId: z.string().regex(UUID_RE, "Ungültige Objekt-ID."),
});
export type ArchivePropertyInput = z.infer<typeof archivePropertySchema>;

// ---- DB row <-> form/payload mapping ----
// Narrow, explicit column list on every write — mirrors
// src/lib/settings/company-update-payload.ts's discipline: only these
// exact keys ever reach Supabase, regardless of what the caller's object
// happens to contain (no id/company_id/created_by leaking through).

export type PropertyInsertPayload = {
  title: string;
  status: PropertyStatus;
  marketing_type: PropertyMarketingType;
  price: number | null;
  property_type: PropertyTypeValue;
  street: string | null;
  house_number: string | null;
  postal_code: string;
  city: string;
  district: string | null;
  country: string;
  living_area_m2: number | null;
  plot_area_m2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  has_balcony: boolean;
  has_terrace: boolean;
  has_garden: boolean;
  has_parking: boolean;
  has_elevator: boolean;
  has_fitted_kitchen: boolean;
  is_accessible: boolean;
  description: string | null;
  external_reference: string | null;
};

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPropertyInsertPayload(values: CreatePropertyInput): PropertyInsertPayload {
  return {
    title: values.title.trim(),
    status: values.status ?? "draft",
    marketing_type: values.marketingType,
    price: values.price ?? null,
    property_type: values.propertyType,
    street: normalizeOptional(values.street),
    house_number: normalizeOptional(values.houseNumber),
    postal_code: values.postalCode.trim(),
    city: values.city.trim(),
    district: normalizeOptional(values.district),
    country: (values.country ?? "DE").trim().toUpperCase(),
    living_area_m2: values.livingAreaM2 ?? null,
    plot_area_m2: values.plotAreaM2 ?? null,
    rooms: values.rooms ?? null,
    bedrooms: values.bedrooms ?? null,
    bathrooms: values.bathrooms ?? null,
    floor: normalizeOptional(values.floor),
    has_balcony: values.hasBalcony ?? false,
    has_terrace: values.hasTerrace ?? false,
    has_garden: values.hasGarden ?? false,
    has_parking: values.hasParking ?? false,
    has_elevator: values.hasElevator ?? false,
    has_fitted_kitchen: values.hasFittedKitchen ?? false,
    is_accessible: values.isAccessible ?? false,
    description: normalizeOptional(values.description),
    external_reference: normalizeOptional(values.externalReference),
  };
}

/** Same field set as the insert payload, but only the keys actually present
 * in `values` (partial update) — never overwrites a field the caller didn't
 * touch with a stray `null`/default. */
export function buildPropertyUpdatePayload(
  values: Omit<UpdatePropertyInput, "propertyId">,
): Partial<PropertyInsertPayload> {
  const payload: Partial<PropertyInsertPayload> = {};
  if (values.title !== undefined) payload.title = values.title.trim();
  if (values.status !== undefined) payload.status = values.status;
  if (values.marketingType !== undefined) payload.marketing_type = values.marketingType;
  if (values.price !== undefined) payload.price = values.price ?? null;
  if (values.propertyType !== undefined) payload.property_type = values.propertyType;
  if (values.street !== undefined) payload.street = normalizeOptional(values.street);
  if (values.houseNumber !== undefined)
    payload.house_number = normalizeOptional(values.houseNumber);
  if (values.postalCode !== undefined) payload.postal_code = values.postalCode.trim();
  if (values.city !== undefined) payload.city = values.city.trim();
  if (values.district !== undefined) payload.district = normalizeOptional(values.district);
  if (values.country !== undefined) payload.country = values.country.trim().toUpperCase();
  if (values.livingAreaM2 !== undefined) payload.living_area_m2 = values.livingAreaM2 ?? null;
  if (values.plotAreaM2 !== undefined) payload.plot_area_m2 = values.plotAreaM2 ?? null;
  if (values.rooms !== undefined) payload.rooms = values.rooms ?? null;
  if (values.bedrooms !== undefined) payload.bedrooms = values.bedrooms ?? null;
  if (values.bathrooms !== undefined) payload.bathrooms = values.bathrooms ?? null;
  if (values.floor !== undefined) payload.floor = normalizeOptional(values.floor);
  if (values.hasBalcony !== undefined) payload.has_balcony = values.hasBalcony;
  if (values.hasTerrace !== undefined) payload.has_terrace = values.hasTerrace;
  if (values.hasGarden !== undefined) payload.has_garden = values.hasGarden;
  if (values.hasParking !== undefined) payload.has_parking = values.hasParking;
  if (values.hasElevator !== undefined) payload.has_elevator = values.hasElevator;
  if (values.hasFittedKitchen !== undefined) payload.has_fitted_kitchen = values.hasFittedKitchen;
  if (values.isAccessible !== undefined) payload.is_accessible = values.isAccessible;
  if (values.description !== undefined) payload.description = normalizeOptional(values.description);
  if (values.externalReference !== undefined)
    payload.external_reference = normalizeOptional(values.externalReference);
  return payload;
}
