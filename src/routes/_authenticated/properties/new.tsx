import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { createProperty } from "@/lib/properties/properties.functions";
import type { PropertyFormValues } from "@/lib/properties/property-rules";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({ meta: [{ title: "Immobilie hinzufügen – EstateAI" }] }),
  component: NewPropertyPage,
});

function NewPropertyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createProperty);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(values: PropertyFormValues) {
    setSubmitting(true);
    try {
      const created = await createFn({ data: values });
      qc.invalidateQueries({ queryKey: ["company-properties"] });
      toast.success("Immobilie angelegt");
      navigate({ to: "/properties/$propertyId", params: { propertyId: created.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Anlegen der Immobilie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-8 py-6">
          <Link
            to="/properties"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-4" /> Immobilien
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="font-display text-2xl sm:text-3xl mb-6">Immobilie hinzufügen</h1>
        <PropertyForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Immobilie anlegen"
        />
      </div>
    </div>
  );
}
