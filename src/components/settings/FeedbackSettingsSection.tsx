// Feedback submission + "my own submitted feedback" history (Product
// Track slice 10, "Feedback Intelligence V1"). Slotted into the existing
// Settings IA as its own tab (task Abschnitt 7: "Prüfe bestehende IA statt
// blind einen neuen Hauptnavpunkt einzubauen") — no new main nav item, no
// new page shell, same SettingsSection card pattern as every other tab.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCompanyFeedback,
  retryFeedbackAnalysis,
  submitFeedback,
} from "@/lib/feedback/feedback.functions";
import {
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_PRIORITY_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUSES,
  resolveEffectiveCategory,
  resolveEffectivePriority,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/feedback/feedback-rules";

const MAX_LENGTH = 4000;

export function FeedbackSettingsSection() {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitFeedback);
  const retryFn = useServerFn(retryFeedbackAnalysis);
  const fetchFeedback = useServerFn(getCompanyFeedback);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const query = useQuery({ queryKey: ["company-feedback"], queryFn: () => fetchFeedback() });
  const items = query.data ?? [];
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const filteredItems =
    statusFilter === "all" ? items : items.filter((i) => i.status === statusFilter);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) {
      setSubmitError("Bitte ein Feedback eingeben.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitFn({ data: { content: trimmed } });
      setContent("");
      setJustSubmitted(true);
      qc.invalidateQueries({ queryKey: ["company-feedback"] });
      toast.success("Danke für dein Feedback!");
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Feedback konnte nicht gesendet werden.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry(feedbackItemId: string) {
    try {
      await retryFn({ data: { feedbackItemId } });
      qc.invalidateQueries({ queryKey: ["company-feedback"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analyse konnte nicht wiederholt werden.");
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Feedback zu EstateAI"
        description="Was funktioniert gut, was fehlt, was nervt? Dein Feedback fließt direkt in die Weiterentwicklung von EstateAI ein."
      >
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="z. B. „Ich würde gerne mehrere Besichtigungstermine gleichzeitig verschieben können.“"
          rows={4}
          maxLength={MAX_LENGTH}
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {content.length}/{MAX_LENGTH}
          </div>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Wird gesendet…" : "Feedback senden"}
          </Button>
        </div>
        {submitError && <p className="text-sm text-destructive">{submitError}</p>}
        {justSubmitted && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> Feedback gespeichert.
          </div>
        )}
      </SettingsSection>

      {items.length > 0 && (
        <SettingsSection title="Mein bisheriges Feedback" description="Nur für dich sichtbar.">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Status:</span>
            {(["all", ...FEEDBACK_STATUSES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium border",
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-accent",
                )}
              >
                {s === "all" ? "Alle" : FEEDBACK_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kein Feedback mit diesem Status.</p>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <FeedbackHistoryRow
                  key={item.id}
                  item={item}
                  onRetry={() => handleRetry(item.id)}
                />
              ))}
            </div>
          )}
        </SettingsSection>
      )}
    </div>
  );
}

function FeedbackHistoryRow({
  item,
  onRetry,
}: {
  item: import("@/lib/feedback/feedback.functions").FeedbackItemWithAnalysis;
  onRetry: () => void;
}) {
  const category = resolveEffectiveCategory({
    category_override: item.category_override,
    ai_category: item.ai_category,
  });
  const priority = resolveEffectivePriority({
    priority_override: item.priority_override,
    ai_suggested_priority: item.ai_suggested_priority,
  });

  return (
    <div className="rounded-xl border border-border p-4 text-sm">
      <p className="whitespace-pre-wrap">{item.raw_content}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="rounded-full bg-accent px-2 py-0.5 font-medium">
          {FEEDBACK_STATUS_LABEL[item.status]}
        </span>
        {category.value && (
          <CategoryBadge value={category.value} isAiSuggested={category.source === "ai"} />
        )}
        {priority.value && (
          <PriorityBadge value={priority.value} isAiSuggested={priority.source === "ai"} />
        )}
        {item.analysis_status === "pending" && (
          <span className="text-muted-foreground">Analyse ausstehend…</span>
        )}
        {item.analysis_status === "failed" && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" /> Analyse fehlgeschlagen — erneut versuchen
          </button>
        )}
      </div>
    </div>
  );
}

function CategoryBadge({
  value,
  isAiSuggested,
}: {
  value: FeedbackCategory;
  isAiSuggested: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium",
        isAiSuggested ? "bg-info/10 text-info" : "bg-primary/10 text-primary",
      )}
      title={isAiSuggested ? "KI-Vorschlag" : "Von einem Menschen festgelegt"}
    >
      {isAiSuggested ? "KI-Vorschlag: " : ""}
      {FEEDBACK_CATEGORY_LABEL[value]}
    </span>
  );
}

function PriorityBadge({
  value,
  isAiSuggested,
}: {
  value: FeedbackPriority;
  isAiSuggested: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium",
        isAiSuggested ? "bg-info/10 text-info" : "bg-primary/10 text-primary",
      )}
      title={
        isAiSuggested ? "KI-Vorschlag, keine Produktentscheidung" : "Von einem Menschen festgelegt"
      }
    >
      {isAiSuggested ? "KI-Priorität (Vorschlag): " : "Priorität: "}
      {FEEDBACK_PRIORITY_LABEL[value]}
    </span>
  );
}
