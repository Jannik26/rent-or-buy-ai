import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen flex bg-muted/30">
      <AppSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden h-14 bg-card border-b border-border flex items-center px-4 sticky top-0 z-20">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logo} alt="" className="size-7" width={28} height={28} />
            <span className="font-display text-base">EstateAI</span>
          </Link>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
