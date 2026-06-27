import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, MessageSquare, Calendar, BarChart3, Settings, LogOut } from "lucide-react";
import logo from "@/assets/estateai-logo.png";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/appointments", label: "Appointments", icon: Calendar },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const profileQuery = useQuery({
    queryKey: ["sidebar-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles").select("full_name, email, company").eq("id", user.id).maybeSingle();
      return data ?? { full_name: null, email: user.email, company: null };
    },
  });
  const profile = profileQuery.data;
  const initials = (profile?.full_name ?? profile?.email ?? "EA")
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join("");

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border">
      <Link to="/dashboard" className="flex items-center gap-2.5 px-6 h-16 border-b border-sidebar-border">
        <img src={logo} alt="" className="size-8" width={32} height={32} />
        <span className="font-display text-lg">EstateAI</span>
      </Link>
      <nav className="flex-1 px-3 py-6 space-y-0.5 text-sm">
        {NAV.map((item) => {
          const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="size-9 rounded-full bg-gold text-gold-foreground grid place-items-center text-xs font-semibold shrink-0">
            {initials || "EA"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{profile?.full_name ?? "Makler"}</div>
            <div className="text-[11px] text-sidebar-foreground/60 truncate">{profile?.company ?? "—"}</div>
          </div>
          <button
            onClick={signOut}
            title="Abmelden"
            className="size-8 grid place-items-center rounded-md hover:bg-sidebar-accent/60 text-sidebar-foreground/70"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <button
          onClick={signOut}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition"
        >
          <LogOut className="size-4" /> Logout
        </button>
      </div>
    </aside>
  );
}
