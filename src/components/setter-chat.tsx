import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, ShoppingBag, Tag, Scale, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const DATA_RE = /<<DATA>>[\s\S]*?<<END>>/g;

function getOrCreateLeadId(companyId: string) {
  if (typeof window === "undefined") return crypto.randomUUID();
  const key = `estateai_lead_${companyId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function partsToText(parts: UIMessage["parts"]) {
  return parts
    .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
    .join("")
    .replace(DATA_RE, "")
    .trim();
}

const QUICK_INTENTS = [
  { id: "verkauf", label: "Ich möchte verkaufen", text: "Ich möchte eine Immobilie verkaufen.", icon: Tag },
  { id: "kauf", label: "Ich möchte kaufen", text: "Ich möchte eine Immobilie kaufen.", icon: ShoppingBag },
  { id: "bewertung", label: "Wert ermitteln", text: "Ich möchte den Wert meiner Immobilie erfahren.", icon: Scale },
] as const;

export function SetterChat({
  companyId,
  companyName,
  greeting,
  apiBase = "",
  variant = "inline",
}: {
  companyId: string;
  companyName: string;
  greeting: string;
  apiBase?: string;
  variant?: "inline" | "panel";
}) {
  const [leadId, setLeadId] = useState(() => getOrCreateLeadId(companyId));

  useEffect(() => {
    setLeadId(getOrCreateLeadId(companyId));
  }, [companyId]);

  useEffect(() => {
    console.log("[EstateChat] active companyId", { companyId, companyName, leadId });
  }, [companyId, companyName, leadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBase}/api/public/widget/chat`,
        body: { companyId, leadId },
      }),
    [apiBase, companyId, leadId],
  );

  const initialMessages: UIMessage[] = useMemo(
    () => [
      {
        id: "greet",
        role: "assistant",
        parts: [{ type: "text", text: greeting }],
      },
    ],
    [greeting],
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { messages, sendMessage, setMessages, stop, status } = useChat({
    id: leadId,
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[EstateChat] chat error", err);
      const raw = err?.message || "";
      let friendly = "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.";
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error) friendly = parsed.error;
      } catch {
        if (raw) friendly = raw;
      }
      setErrorMsg(friendly);
    },
    onFinish: ({ message }) => {
      console.log("[EstateChat] message finished", { id: message.id, role: message.role });
      setErrorMsg(null);
    },
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status]);

  const busy = status === "submitted" || status === "streaming";
  const userHasSpoken = messages.some((m) => m.role === "user");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErrorMsg(null);
    console.log("[EstateChat] sendMessage", { companyId, leadId, text });
    void sendMessage({ text });
  }

  function sendQuick(text: string) {
    if (busy) return;
    setErrorMsg(null);
    void sendMessage({ text });
  }

  function startNewConversation() {
    stop();
    const key = `estateai_lead_${companyId}`;
    sessionStorage.removeItem(key);
    const newId = crypto.randomUUID();
    sessionStorage.setItem(key, newId);
    setLeadId(newId);
    setMessages(initialMessages);
    setInput("");
    setErrorMsg(null);
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-card text-card-foreground overflow-hidden",
        variant === "inline" ? "rounded-2xl border border-border shadow-elegant h-[560px]" : "h-full",
      )}
    >
      <header className="bg-gradient-navy text-primary-foreground px-5 py-4 flex items-center gap-3">
        <div className="size-9 rounded-full bg-gold/20 ring-gold grid place-items-center text-gold font-display text-lg">E</div>
        <div className="min-w-0">
          <div className="font-display text-base leading-tight">{companyName}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success animate-pulse" /> Online · EstateAI-Berater
          </div>
        </div>
        <button
          type="button"
          onClick={startNewConversation}
          className="ml-auto shrink-0 rounded-lg p-1.5 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition"
          aria-label="Neue Anfrage starten"
          title="Neue Anfrage starten"
        >
          <RotateCcw className="size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-muted/30">
        {messages.map((m) => {
          const text = partsToText(m.parts);
          if (!text && m.role === "assistant" && busy) return null;
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-chat-user text-chat-user-foreground px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                  {text}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[88%] text-sm leading-relaxed text-foreground prose prose-sm prose-p:my-1.5 prose-strong:text-foreground">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            </div>
          );
        })}

        {!userHasSpoken && !busy && (
          <div className="flex flex-col gap-2 pt-1">
            {QUICK_INTENTS.map(({ id, label, text, icon: Icon }) => (
              <button
                key={id}
                onClick={() => sendQuick(text)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm hover:border-gold hover:bg-accent transition"
              >
                <span className="size-8 rounded-lg bg-accent grid place-items-center text-primary group-hover:bg-gold/15 group-hover:text-gold transition">
                  <Icon className="size-4" />
                </span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        )}

        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 px-3 py-2">
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
            </div>
          </div>
        )}
        {errorMsg && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-xl border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">
              {errorMsg}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-border bg-card p-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Ihre Nachricht…"
          disabled={busy}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring max-h-32"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="size-10 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center transition hover:bg-secondary disabled:opacity-40"
          aria-label="Senden"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
