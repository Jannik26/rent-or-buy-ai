import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversations – EstateAI" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="font-display text-2xl sm:text-3xl">Conversations</h1>
      <p className="mt-1 text-sm text-muted-foreground">Alle Chat-Verläufe Ihrer Leads.</p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-12 shadow-soft text-center">
        <div className="size-12 mx-auto rounded-2xl bg-muted grid place-items-center">
          <MessageSquare className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
          Conversations werden hier angezeigt. {/* TODO: Implement conversation list view */}
        </p>
      </div>
    </div>
  );
}
