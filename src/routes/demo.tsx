import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SetterChat } from "@/components/setter-chat";
import { useEffectiveCompany } from "@/lib/use-effective-company";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/demo")({
  head: () => ({ meta: [{ title: "Demo – EstateAI" }] }),
  component: DemoPage,
});

function DemoPage() {
  const company = useEffectiveCompany();

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
          <SetterChat companyId={company.id} companyName={company.name} greeting={company.greeting} variant="panel" />
        </div>
      </div>
    </div>
  );
}
