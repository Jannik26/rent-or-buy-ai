import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SetterChat } from "@/components/setter-chat";

export const Route = createFileRoute("/widget/$companyId")({
  component: WidgetPage,
});

function WidgetPage() {
  const { companyId } = Route.useParams();
  const [company, setCompany] = useState<{ name: string; greeting: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("companies").select("name, greeting").eq("id", companyId).maybeSingle();
      if (data) setCompany({ name: data.name, greeting: data.greeting ?? "Hallo! Wie kann ich Ihnen bei der Immobiliensuche helfen?" });
    })();
  }, [companyId]);

  if (!company) {
    return <div className="h-screen grid place-items-center text-sm text-muted-foreground">Lade…</div>;
  }

  return (
    <div className="h-screen w-screen p-3 bg-transparent">
      <SetterChat companyId={companyId} companyName={company.name} greeting={company.greeting} variant="panel" />
    </div>
  );
}
