import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Archive, Pencil } from "lucide-react";
import { PropertyForm, propertyToFormValues } from "@/components/properties/PropertyForm";
import {
  archiveProperty,
  getProperty,
  updateProperty,
} from "@/lib/properties/properties.functions";
import {
  PROPERTY_MARKETING_TYPE_LABEL,
  PROPERTY_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  type PropertyFormValues,
} from "@/lib/properties/property-rules";

export const Route = createFileRoute("/_authenticated/properties/$propertyId")({
  head: () => ({ meta: [{ title: "Immobilie – EstateAI" }] }),
  component: PropertyDetailPage,
});

function formatPrice(price: number | null, marketingType: string): string {
  if (price == null) return "—";
  const formatted = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(price);
  return marketingType === "miete" ? `${formatted} € / Monat` : `${formatted} €`;
}

function formatRooms(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchProperty = useServerFn(getProperty);
  const query = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProperty({ data: { propertyId } }),
  });

  const updateFn = useServerFn(updateProperty);
  const archiveFn = useServerFn(archiveProperty);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["property", propertyId] });
    qc.invalidateQueries({ queryKey: ["company-properties"] });
  }

  async function handleSubmit(values: PropertyFormValues) {
    setSubmitting(true);
    try {
      await updateFn({ data: { propertyId, ...values } });
      invalidateAll();
      setEditing(false);
      toast.success("Immobilie aktualisiert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await archiveFn({ data: { propertyId } });
      invalidateAll();
      toast.success("Immobilie archiviert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Archivieren.");
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <div className="p-10 text-sm text-muted-foreground">Lade…</div>;
  const property = query.data;
  if (!property) {
    return (
      <div className="p-10">
        <Link
          to="/properties"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-4" /> Zurück
        </Link>
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Immobilie nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-8 py-6 flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/properties" })}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-4" /> Immobilien
          </button>
          {!editing && (
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={() => setEditing(true)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Pencil className="size-3.5" /> Bearbeiten
              </button>
              {property.status !== "archived" && (
                <button
                  disabled={busy}
                  onClick={handleArchive}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 text-muted-foreground inline-flex items-center gap-1.5"
                >
                  <Archive className="size-3.5" /> Archivieren
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10">
        {editing ? (
          <>
            <h1 className="font-display text-2xl sm:text-3xl mb-6">Immobilie bearbeiten</h1>
            <PropertyForm
              initialValues={propertyToFormValues(property)}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitLabel="Änderungen speichern"
            />
            <button
              onClick={() => setEditing(false)}
              className="mt-4 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl sm:text-3xl">{property.title}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {property.postal_code} {property.city}
              {property.district ? ` · ${property.district}` : ""}
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
                {PROPERTY_STATUS_LABEL[property.status]}
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
                {PROPERTY_MARKETING_TYPE_LABEL[property.marketing_type]}
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
                {PROPERTY_TYPE_LABEL[property.property_type]}
              </span>
            </div>
            <div className="mt-4 font-display text-2xl">
              {formatPrice(property.price, property.marketing_type)}
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg mb-4">Kerndaten</h2>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <Field
                  label="Wohnfläche"
                  value={property.living_area_m2 != null ? `${property.living_area_m2} m²` : null}
                />
                <Field
                  label="Grundstücksfläche"
                  value={property.plot_area_m2 != null ? `${property.plot_area_m2} m²` : null}
                />
                <Field
                  label="Zimmer"
                  value={property.rooms != null ? formatRooms(property.rooms) : null}
                />
                <Field label="Schlafzimmer" value={property.bedrooms} />
                <Field label="Badezimmer" value={property.bathrooms} />
                <Field label="Etage" value={property.floor} />
              </dl>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg mb-4">Ausstattung</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  ["Balkon", property.has_balcony],
                  ["Terrasse", property.has_terrace],
                  ["Garten", property.has_garden],
                  ["Stellplatz/Garage", property.has_parking],
                  ["Aufzug", property.has_elevator],
                  ["Einbauküche", property.has_fitted_kitchen],
                  ["Barrierearm/-frei", property.is_accessible],
                ]
                  .filter(([, has]) => has)
                  .map(([label]) => (
                    <span
                      key={label as string}
                      className="rounded-full bg-accent px-2.5 py-1 font-medium"
                    >
                      {label}
                    </span>
                  ))}
                {![
                  property.has_balcony,
                  property.has_terrace,
                  property.has_garden,
                  property.has_parking,
                  property.has_elevator,
                  property.has_fitted_kitchen,
                  property.is_accessible,
                ].some(Boolean) && <span className="text-muted-foreground">Keine Angaben.</span>}
              </div>
            </div>

            {(property.description || property.external_reference) && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-lg mb-4">Beschreibung</h2>
                {property.description && (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {property.description}
                  </p>
                )}
                {property.external_reference && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Externe Referenz: {property.external_reference}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
