import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { runDiagnostics, type DiagnosticsResult } from "@/lib/diagnostics.functions";
import { CheckCircle2, XCircle, RefreshCw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/diagnose")({
  component: DiagnosePage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">Diagnose fehlgeschlagen: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Nicht gefunden</div>,
});

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
      )}
    >
      {ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {ok ? "Ja" : "Nein"}
    </span>
  );
}

function Row({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="font-medium text-sm text-foreground">{label}</div>
        {detail && <div className="text-xs text-muted-foreground mt-0.5 break-words">{detail}</div>}
      </div>
      <StatusBadge ok={ok} />
    </div>
  );
}

function DiagnosePage() {
  const router = useRouter();
  const fn = useServerFn(runDiagnostics);

  const { data, isFetching, error, refetch } = useQuery<DiagnosticsResult>({
    queryKey: ["diagnostics"],
    queryFn: () => fn({ data: undefined }),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Activity className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl">System-Diagnose</h1>
              <p className="text-sm text-muted-foreground">Versteckte Admin-Ansicht für Chat-Probleme</p>
            </div>
          </div>
          <button
            onClick={() => {
              void refetch();
              void router.invalidate();
            }}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Neu prüfen
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
            {error.message}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          {!data && isFetching && <div className="text-sm text-muted-foreground">Lade Diagnose…</div>}
          {data && (
            <>
              <Row
                label="companyId vorhanden"
                ok={data.companyId.ok}
                detail={`Demo-ID ${data.companyId.value}${data.companyId.ok ? "" : " – Firma nicht in DB gefunden"}`}
              />
              <Row label="Supabase verbunden" ok={data.supabase.ok} detail={data.supabase.detail} />
              <Row label="LOVABLE_API_KEY vorhanden" ok={data.lovableApiKey.ok} detail={data.lovableApiKey.detail} />
              <Row
                label="KI-Modell erreichbar (google/gemini-3-flash-preview)"
                ok={data.aiModel.ok}
                detail={data.aiModel.sample ? `${data.aiModel.detail} · Antwort: „${data.aiModel.sample}"` : data.aiModel.detail}
              />

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Letzter Fehler</div>
                  {data.lastError ? (
                    <>
                      <div className="text-xs text-muted-foreground">
                        {new Date(data.lastError.at).toLocaleString("de-DE")} · {data.lastError.source}
                      </div>
                      <div className="text-sm text-destructive mt-1 break-words">{data.lastError.message}</div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Keine Fehler protokolliert.</div>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Letzte erfolgreiche Antwort</div>
                  {data.lastSuccess ? (
                    <>
                      <div className="text-xs text-muted-foreground">
                        {new Date(data.lastSuccess.at).toLocaleString("de-DE")} · {data.lastSuccess.source}
                      </div>
                      <div className="text-sm text-foreground mt-1 break-words">{data.lastSuccess.message}</div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Noch keine erfolgreiche Antwort.</div>
                  )}
                </div>
              </div>

              <div className="mt-4 text-[11px] text-muted-foreground text-right">
                Geprüft: {new Date(data.checkedAt).toLocaleString("de-DE")}
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Diese Seite ist nicht verlinkt. Direktaufruf über <code className="font-mono">/diagnose</code>.
        </p>
      </div>
    </div>
  );
}
