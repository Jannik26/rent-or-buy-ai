import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus } from "lucide-react";
import { getCompanyProperties, type PropertyRow } from "@/lib/properties/properties.functions";
import {
  PROPERTY_MARKETING_TYPE_LABEL,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  type PropertyStatus,
} from "@/lib/properties/property-rules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Immobilien – EstateAI" }] }),
  component: PropertiesPage,
});

const STATUS_FILTER_OPTIONS: Array<{ value: PropertyStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  ...PROPERTY_STATUSES.map((s) => ({ value: s, label: PROPERTY_STATUS_LABEL[s] })),
];

function formatPrice(price: number | null, marketingType: string): string {
  if (price == null) return "—";
  const formatted = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(price);
  return marketingType === "miete" ? `${formatted} € / Monat` : `${formatted} €`;
}

function PropertiesPage() {
  const fetchProperties = useServerFn(getCompanyProperties);
  const query = useQuery({ queryKey: ["company-properties"], queryFn: () => fetchProperties() });
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | "all">("all");

  const properties = query.data ?? [];
  // No useMemo here — a Makler's property list is small (dozens, not
  // thousands, see docs/platform-modules.md's performance note on scale),
  // so a plain filter on every render is cheaper than the memoization
  // bookkeeping it would replace.
  const filtered =
    statusFilter === "all" ? properties : properties.filter((p) => p.status === statusFilter);

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Immobilien</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {properties.length > 0
              ? `${properties.length} Immobilie${properties.length === 1 ? "" : "n"} im Bestand.`
              : "Ihr Immobilienbestand für das Property Matching."}
          </p>
        </div>
        <Link
          to="/properties/new"
          className="rounded-lg px-4 py-2.5 text-sm font-medium bg-gold text-gold-foreground hover:opacity-90 inline-flex items-center gap-1.5 transition"
        >
          <Plus className="size-4" /> Immobilie hinzufügen
        </Link>
      </div>

      {properties.length > 0 && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition",
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-accent",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {query.isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Lade…</div>
      ) : properties.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
          <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
            Noch keine Immobilien angelegt.
          </p>
          <Link
            to="/properties/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium bg-gold text-gold-foreground hover:opacity-90 transition"
          >
            <Plus className="size-4" /> Immobilie hinzufügen
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
          <p className="text-sm text-muted-foreground">Keine Immobilien mit diesem Status.</p>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property }: { property: PropertyRow }) {
  return (
    <Link
      to="/properties/$propertyId"
      params={{ propertyId: property.id }}
      className="rounded-2xl border border-border bg-card p-5 hover:shadow-elegant transition block"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base leading-snug line-clamp-2">{property.title}</h3>
        <StatusChip status={property.status} />
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        {property.postal_code} {property.city}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
          {PROPERTY_MARKETING_TYPE_LABEL[property.marketing_type]}
        </span>
        <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
          {PROPERTY_TYPE_LABEL[property.property_type]}
        </span>
        {property.rooms != null && (
          <span className="text-muted-foreground">{formatRoomsShort(property.rooms)} Zi.</span>
        )}
        {property.living_area_m2 != null && (
          <span className="text-muted-foreground">{property.living_area_m2} m²</span>
        )}
      </div>
      <div className="mt-3 font-display text-lg">
        {formatPrice(property.price, property.marketing_type)}
      </div>
    </Link>
  );
}

function formatRoomsShort(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

const STATUS_STYLES: Record<PropertyStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/15 text-success",
  reserved: "bg-gold/15 text-gold",
  sold: "bg-info/10 text-info",
  rented: "bg-info/10 text-info",
  archived: "bg-muted text-muted-foreground",
};

function StatusChip({ status }: { status: PropertyStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {PROPERTY_STATUS_LABEL[status]}
    </span>
  );
}
