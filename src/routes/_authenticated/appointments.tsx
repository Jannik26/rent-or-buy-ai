import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments – EstateAI" }] }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Appointments</h1>
      <p className="mt-1 text-sm text-muted-foreground">Vereinbarte Termine mit Ihren Leads.</p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
        <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
          <Calendar className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
          Termine werden hier angezeigt. {/* TODO: Implement appointments view */}
        </p>
      </div>
    </div>
  );
}
