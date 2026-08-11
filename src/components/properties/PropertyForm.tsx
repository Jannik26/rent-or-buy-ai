// Shared create/edit form for the Property Domain Model (Product Track
// slice 9) — used by both properties/new.tsx and properties/$propertyId.tsx
// (edit mode), same react-hook-form + zodResolver + shadcn Form pattern as
// CompanySettingsForm.tsx, the established convention for multi-field
// structured forms in this app (Leads/Appointments' inline mini-forms use
// manual useState instead, appropriate there for 2-3 fields, not for the
// ~25 fields a property has).
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PROPERTY_MARKETING_TYPE_LABEL,
  PROPERTY_MARKETING_TYPES,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/properties/property-rules";
import type { PropertyRow } from "@/lib/properties/properties.functions";

const DEFAULT_VALUES: PropertyFormValues = {
  title: "",
  status: "draft",
  marketingType: "kauf",
  price: null,
  propertyType: "wohnung",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  district: "",
  country: "DE",
  livingAreaM2: null,
  plotAreaM2: null,
  rooms: null,
  bedrooms: null,
  bathrooms: null,
  floor: "",
  hasBalcony: false,
  hasTerrace: false,
  hasGarden: false,
  hasParking: false,
  hasElevator: false,
  hasFittedKitchen: false,
  isAccessible: false,
  description: "",
  externalReference: "",
};

export function propertyToFormValues(property: PropertyRow): PropertyFormValues {
  return {
    title: property.title,
    status: property.status,
    marketingType: property.marketing_type,
    price: property.price,
    propertyType: property.property_type,
    street: property.street ?? "",
    houseNumber: property.house_number ?? "",
    postalCode: property.postal_code,
    city: property.city,
    district: property.district ?? "",
    country: property.country,
    livingAreaM2: property.living_area_m2,
    plotAreaM2: property.plot_area_m2,
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    floor: property.floor ?? "",
    hasBalcony: property.has_balcony,
    hasTerrace: property.has_terrace,
    hasGarden: property.has_garden,
    hasParking: property.has_parking,
    hasElevator: property.has_elevator,
    hasFittedKitchen: property.has_fitted_kitchen,
    isAccessible: property.is_accessible,
    description: property.description ?? "",
    externalReference: property.external_reference ?? "",
  };
}

const inputCls =
  "rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const selectCls = cn(inputCls, "cursor-pointer");

function NumberField({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <Input
      type="number"
      step={step ?? "1"}
      value={value ?? ""}
      placeholder={placeholder}
      className={inputCls}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
    />
  );
}

const FEATURE_FIELDS = [
  { name: "hasBalcony", label: "Balkon" },
  { name: "hasTerrace", label: "Terrasse" },
  { name: "hasGarden", label: "Garten" },
  { name: "hasParking", label: "Stellplatz/Garage" },
  { name: "hasElevator", label: "Aufzug" },
  { name: "hasFittedKitchen", label: "Einbauküche" },
  { name: "isAccessible", label: "Barrierearm/-frei" },
] as const;

export function PropertyForm({
  initialValues,
  onSubmit,
  submitting,
  submitLabel,
}: {
  initialValues?: PropertyFormValues;
  onSubmit: (values: PropertyFormValues) => Promise<void> | void;
  submitting: boolean;
  submitLabel: string;
}) {
  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: initialValues ?? DEFAULT_VALUES,
  });

  // Re-hydrate when a different property's initialValues arrive (edit mode
  // navigating between properties re-uses the same mounted route in some
  // router configurations) — mirrors CompanySettingsForm's hydrate-once
  // pattern, but keyed on the actual identity of the incoming values object
  // reference from the caller rather than a ref-guard, since this form can
  // legitimately need to re-hydrate more than once across its lifetime.
  useEffect(() => {
    if (initialValues) form.reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  async function handleSubmit(values: PropertyFormValues) {
    await onSubmit(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* ---- Identität ---- */}
        <FormSection title="Identität">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Titel / interne Bezeichnung</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="z. B. 3-Zi.-Wohnung Musterstraße"
                    className={inputCls}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <select {...field} className={selectCls}>
                    {PROPERTY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PROPERTY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* ---- Vermarktung ---- */}
        <FormSection title="Vermarktung">
          <FormField
            control={form.control}
            name="marketingType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kauf / Miete</FormLabel>
                <FormControl>
                  <select {...field} className={selectCls}>
                    {PROPERTY_MARKETING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PROPERTY_MARKETING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="propertyType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Objekttyp</FormLabel>
                <FormControl>
                  <select {...field} className={selectCls}>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PROPERTY_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preis (€)</FormLabel>
                <FormControl>
                  <NumberField
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="z. B. 450000"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* ---- Lage ---- */}
        <FormSection title="Lage">
          <FormField
            control={form.control}
            name="street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Straße (optional)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="houseNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hausnummer (optional)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="postalCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PLZ</FormLabel>
                <FormControl>
                  <Input {...field} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stadt</FormLabel>
                <FormControl>
                  <Input {...field} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="district"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stadtteil (optional)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Land</FormLabel>
                <FormControl>
                  <Input {...field} className={inputCls} maxLength={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* ---- Kerndaten ---- */}
        <FormSection title="Kerndaten">
          <FormField
            control={form.control}
            name="livingAreaM2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wohnfläche (m²)</FormLabel>
                <FormControl>
                  <NumberField value={field.value} onChange={field.onChange} step="0.1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="plotAreaM2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Grundstücksfläche (m², optional)</FormLabel>
                <FormControl>
                  <NumberField value={field.value} onChange={field.onChange} step="0.1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rooms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zimmer</FormLabel>
                <FormControl>
                  <NumberField
                    value={field.value}
                    onChange={field.onChange}
                    step="0.5"
                    placeholder="z. B. 3,5"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bedrooms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Schlafzimmer (optional)</FormLabel>
                <FormControl>
                  <NumberField value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bathrooms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Badezimmer (optional)</FormLabel>
                <FormControl>
                  <NumberField value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="floor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Etage (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="z. B. 2. OG"
                    className={inputCls}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* ---- Ausstattung ---- */}
        <FormSection title="Ausstattung">
          <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FEATURE_FIELDS.map(({ name, label }) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={field.value ?? false}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="size-4 rounded border-input accent-primary cursor-pointer"
                    />
                    {label}
                  </label>
                )}
              />
            ))}
          </div>
        </FormSection>

        {/* ---- Beschreibung ---- */}
        <FormSection title="Beschreibung">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Beschreibung / Notizen (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={4} className="resize-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="externalReference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Externe Referenz / Makler-ID (optional)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} className={inputCls} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg mb-4">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
