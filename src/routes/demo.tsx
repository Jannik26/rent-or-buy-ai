import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SetterChat } from "@/components/setter-chat";
import logo from "@/assets/estateai-logo.png";

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

export const Route = createFileRoute("/demo")({
  head: () => ({ meta: [{ title: "Demo – EstateAI" }] }),
  loader: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("companies")
      .select("id, name, greeting")
      .eq("id", DEMO_COMPANY_ID)
      .maybeSingle();
    return { demoCompany: data };
  },
  component: DemoPage,
});

function DemoPage() {
  const { demoCompany } = Route.useLoaderData();
  const companyId = demoCompany?.id ?? DEMO_COMPANY_ID;
  const companyName = demoCompany?.name ?? "EstateAI Demo Immobilien";
  const greeting = demoCompany?.greeting ?? "Willkommen bei EstateAI. Wie kann ich Ihnen helfen?";

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="h-16 bg-card border-b border-border flex items-center px-6 gap-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Zurück
        </Link>
        <div className="flex-1" />
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="" className="size-7" width={28} height={28} />
          <span className="font-display text-base">EstateAI Demo</span>
        </Link>
      </header>
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-8">
        <div className="rounded-2xl border border-border bg-card shadow-soft h-[calc(100vh-10rem)] overflow-hidden">
          <SetterChat companyId={companyId} companyName={companyName} greeting={greeting} variant="panel" />
        </div>
      </div>
    </div>
  );
}
