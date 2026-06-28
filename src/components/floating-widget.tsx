import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { SetterChat } from "./setter-chat";
import { cn } from "@/lib/utils";

export function FloatingWidget(props: {
  companyId: string;
  companyName: string;
  greeting: string;
  apiBase?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPulse(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <div
        className={cn(
          "w-[380px] max-w-[calc(100vw-2.5rem)] origin-bottom-right transition-all duration-300",
          open ? "pointer-events-auto scale-100 opacity-100 translate-y-0" : "pointer-events-none scale-95 opacity-0 translate-y-2",
        )}
      >
        <SetterChat {...props} variant="inline" />
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Chat schließen" : "Chat öffnen"}
        className={cn(
          "pointer-events-auto relative size-14 rounded-full bg-gradient-navy text-primary-foreground shadow-elegant grid place-items-center transition hover:scale-105",
          pulse && !open && "before:absolute before:inset-0 before:rounded-full before:bg-gold/40 before:animate-ping",
        )}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
