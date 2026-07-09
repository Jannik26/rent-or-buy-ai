import { Link } from "@tanstack/react-router";
import logo from "@/assets/estateai-logo.png";

export function Footer({ kontaktHref = "/#kontakt" }: { kontaktHref?: string }) {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="size-6" width={24} height={24} />
          <span>© {new Date().getFullYear()} EstateAI – Mehr aus Immobilien-Leads machen.</span>
        </div>
        <div className="flex gap-6">
          <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
          <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
          <a href={kontaktHref} className="hover:text-foreground">Kontakt</a>
        </div>
      </div>
    </footer>
  );
}
