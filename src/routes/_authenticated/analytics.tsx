import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics – EstateAI" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Performance Ihrer Lead-Pipeline.</p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
        <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
          <BarChart3 className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
          Analytics werden hier angezeigt. {/* TODO: Implement analytics dashboard */}
        </p>
      </div>
    </div>
  );
}
