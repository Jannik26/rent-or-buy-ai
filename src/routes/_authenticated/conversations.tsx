import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntentChip, ScorePill, StatusBadge, formatDate } from "./dashboard";
import {
  getConversationDetail,
  getConversations,
  type ConversationListItem,
} from "@/lib/conversations/conversations.functions";
import {
  CONVERSATION_SCORE_FILTERS,
  CONVERSATION_STATUS_FILTERS,
  matchesScoreFilter,
  matchesSearch,
  matchesStatusFilter,
  type ConversationScoreFilter,
  type ConversationStatusFilter,
  type NormalizedMessage,
} from "@/lib/conversations/conversation-rules";
import type { LeadIntent, LeadScore } from "@/lib/lead-summary-schema";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversations – EstateAI" }] }),
  component: ConversationsPage,
});

const STATUS_LABELS: Record<ConversationStatusFilter, string> = {
  all: "Alle Status",
  neu: "Neu",
  qualifiziert: "Qualifiziert",
  termin: "Termin",
};

const SCORE_LABELS: Record<ConversationScoreFilter, string> = {
  all: "Alle Scores",
  hot: "🔥 Hot",
  warm: "🟠 Warm",
  cold: "🔵 Cold",
};

function ConversationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ConversationScoreFilter>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const fetchConversations = useServerFn(getConversations);
  const listQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    refetchInterval: 20000,
  });
  const conversations = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) =>
          matchesSearch(c.name, search) &&
          matchesStatusFilter(c.status, statusFilter) &&
          matchesScoreFilter(c.score, scoreFilter),
      ),
    [conversations, search, statusFilter, scoreFilter],
  );

  const showDetailOnMobile = selectedLeadId !== null;

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col">
      <div className="px-4 sm:px-8 pt-4 sm:pt-8 pb-2 shrink-0">
        <h1 className="font-display text-2xl sm:text-3xl">Conversations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle Chat-Verläufe Ihrer Leads — read-only.
        </p>
      </div>

      <div className="flex-1 min-h-0 px-4 sm:px-8 pb-4 sm:pb-8">
        <div className="h-full grid lg:grid-cols-[360px_1fr] gap-4 rounded-2xl border border-border bg-card shadow-soft overflow-hidden lg:border lg:bg-transparent lg:shadow-none">
          <div
            className={cn(
              "min-h-0 flex flex-col border-border lg:border lg:rounded-2xl lg:bg-card lg:shadow-soft overflow-hidden",
              showDetailOnMobile ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="p-3 space-y-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
                <Search className="size-4 text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nach Name suchen…"
                  className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground min-w-0"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONVERSATION_STATUS_FILTERS.map((s) => (
                  <FilterChip
                    key={s}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                    label={STATUS_LABELS[s]}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONVERSATION_SCORE_FILTERS.map((s) => (
                  <FilterChip
                    key={s}
                    active={scoreFilter === s}
                    onClick={() => setScoreFilter(s)}
                    label={SCORE_LABELS[s]}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {listQuery.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Lade…</div>
              ) : conversations.length === 0 ? (
                <EmptyListState reason="none" />
              ) : filtered.length === 0 ? (
                <EmptyListState reason="filtered" />
              ) : (
                filtered.map((c) => (
                  <ConversationRow
                    key={c.leadId}
                    conversation={c}
                    active={c.leadId === selectedLeadId}
                    onClick={() => setSelectedLeadId(c.leadId)}
                  />
                ))
              )}
            </div>
          </div>

          <div
            className={cn(
              "min-h-0 lg:border lg:border-border lg:rounded-2xl lg:bg-card lg:shadow-soft overflow-hidden",
              showDetailOnMobile ? "flex flex-col" : "hidden lg:flex lg:flex-col",
            )}
          >
            {selectedLeadId ? (
              <ConversationDetailPanel
                leadId={selectedLeadId}
                onBack={() => setSelectedLeadId(null)}
              />
            ) : (
              <div className="flex-1 grid place-items-center p-8 text-center">
                <div>
                  <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
                    <MessageSquare className="size-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground max-w-xs">
                    Wählen Sie links eine Conversation aus, um den Gesprächsverlauf zu sehen.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium border transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function EmptyListState({ reason }: { reason: "none" | "filtered" }) {
  return (
    <div className="p-8 text-center">
      <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
        <MessageSquare className="size-6 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground max-w-xs mx-auto">
        {reason === "none"
          ? "Noch keine Conversations. Sobald ein Besucher mit Ihrem EstateAI-Chat spricht, erscheint das Gespräch hier."
          : "Keine Conversations entsprechen der Suche/den Filtern."}
      </p>
    </div>
  );
}

function ConversationRow({
  conversation: c,
  active,
  onClick,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onClick: () => void;
}) {
  const initials =
    (c.name ?? "??")
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border last:border-0 transition flex items-start gap-3",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="size-9 rounded-full bg-gradient-navy text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{c.name ?? "Anonymer Besucher"}</span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
            {formatDate(c.activityAt)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {c.lastMessageRole === "user" ? "" : "Sie: "}
          {c.lastMessagePreview || "—"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <IntentChip intent={c.intent as LeadIntent} />
          <StatusBadge status={c.status} score={c.score as LeadScore} />
          <span className="text-[10px] text-muted-foreground">
            {c.messageCount} {c.messageCount === 1 ? "Nachricht" : "Nachrichten"}
          </span>
        </div>
      </div>
    </button>
  );
}

function ConversationDetailPanel({ leadId, onBack }: { leadId: string; onBack: () => void }) {
  const fetchDetail = useServerFn(getConversationDetail);
  const query = useQuery({
    queryKey: ["conversation-detail", leadId],
    queryFn: () => fetchDetail({ data: { leadId } }),
  });

  if (query.isLoading) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Lade…</div>
    );
  }
  const detail = query.data;
  if (!detail) {
    return (
      <div className="flex-1 grid place-items-center p-8 text-center">
        <div>
          <button
            onClick={onBack}
            className="lg:hidden mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Zurück
          </button>
          <p className="text-sm text-muted-foreground">Conversation nicht gefunden.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 sm:px-6 py-4">
        <button
          onClick={onBack}
          className="lg:hidden mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Alle Conversations
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-lg">{detail.name ?? "Anonymer Besucher"}</h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <IntentChip intent={detail.intent as LeadIntent} />
              <StatusBadge status={detail.status} score={detail.score as LeadScore} />
              <ScorePill score={detail.score as LeadScore} num={detail.scoreNumeric} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {detail.email && (
              <a
                href={`mailto:${detail.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="size-3.5" /> {detail.email}
              </a>
            )}
            {detail.phone && (
              <a
                href={`tel:${detail.phone}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="size-3.5" /> {detail.phone}
              </a>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Gespräch gestartet {formatDate(detail.createdAt)} · Zuletzt aktualisiert{" "}
          {formatDate(detail.updatedAt)}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {detail.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Nachrichten.</p>
        ) : (
          detail.messages.map((m, i) => <MessageBubble key={i} message={m} />)
        )}
      </div>
    </>
  );
}

function MessageBubble({ message: m }: { message: NormalizedMessage }) {
  if (m.role === "unknown") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-xl border border-dashed border-border px-3.5 py-2 text-xs text-muted-foreground italic">
          {m.content || "Nachricht ohne erkennbare Rolle/Inhalt (Legacy-Datensatz)"}
        </div>
      </div>
    );
  }
  const isUser = m.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {m.content || <span className="italic opacity-60">— kein Inhalt —</span>}
      </div>
    </div>
  );
}
