import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const DATA_RE = /<<DATA>>[\s\S]*?<<END>>/g;

function getOrCreateLeadId(companyId: string) {
  if (typeof window === "undefined") return crypto.randomUUID();
  const key = `setterai_lead_${companyId}`;
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
  const leadId = useMemo(() => getOrCreateLeadId(companyId), [companyId]);

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

  const { messages, sendMessage, status } = useChat({
    id: leadId,
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[SetterChat] chat error", err);
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
      console.log("[SetterChat] message finished", { id: message.id, role: message.role });
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

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErrorMsg(null);
    console.log("[SetterChat] sendMessage", { companyId, leadId, text });
    void sendMessage({ text });
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-card text-card-foreground overflow-hidden",
        variant === "inline" ? "rounded-2xl border border-border shadow-elegant h-[560px]" : "h-full",
      )}
    >
      <header className="bg-gradient-navy text-primary-foreground px-5 py-4 flex items-center gap-3">
        <div className="size-9 rounded-full bg-gold/20 ring-gold grid place-items-center text-gold font-display text-lg">S</div>
        <div className="min-w-0">
          <div className="font-display text-base leading-tight">{companyName}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success animate-pulse" /> Online · KI-Berater
          </div>
        </div>
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
