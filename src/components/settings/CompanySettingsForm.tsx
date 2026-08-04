import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { companySettingsSchema, type CompanySettingsFormValues } from "@/lib/settings/schemas";
import { buildCompanyUpdatePayload } from "@/lib/settings/company-update-payload";
import { mapAuthErrorMessage } from "@/lib/settings/auth-errors";
import { invalidateProfileCaches } from "@/lib/settings/invalidate-profile-caches";
import {
  RESPONSE_TIME_OPTIONS,
  DEFAULT_RESPONSE_TIME,
  type ResponseTimeValue,
} from "@/lib/response-time";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ComingSoonSettingsCard } from "@/components/settings/ComingSoonSettingsCard";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CompanyData = {
  id: string;
  name: string;
  greeting: string | null;
  response_time: string;
  privacy_url: string | null;
  terms_url: string | null;
};

async function fetchCompanySettings(): Promise<CompanyData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("companies")
    .select("id, name, greeting, response_time, privacy_url, terms_url")
    .eq("owner_id", user.id)
    .maybeSingle();
  return data;
}

function toFormValues(company: CompanyData): CompanySettingsFormValues {
  return {
    name: company.name,
    greeting: company.greeting ?? "",
    response_time: (company.response_time as ResponseTimeValue) ?? DEFAULT_RESPONSE_TIME,
    privacy_url: company.privacy_url ?? "",
    terms_url: company.terms_url ?? "",
  };
}

export function CompanySettingsForm({
  onDirtyChange,
  // Every authenticated user structurally owns exactly one company
  // (companies.owner_id is unique, enforced by RLS as owner_id = auth.uid()).
  // This is a placeholder extension point for the future RE/MAX multi-agent
  // model (see CLAUDE.md roadmap) — once a company can have non-owner
  // members, derive this from that membership/role instead of a constant.
  canEditCompany = true,
}: {
  onDirtyChange: (dirty: boolean) => void;
  canEditCompany?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["company"], queryFn: fetchCompanySettings });

  const form = useForm<CompanySettingsFormValues>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: "",
      greeting: "",
      response_time: DEFAULT_RESPONSE_TIME,
      privacy_url: "",
      terms_url: "",
    },
  });

  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !query.data) return;
    hydrated.current = true;
    form.reset(toFormValues(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function onSubmit(values: CompanySettingsFormValues) {
    if (!query.data) return;
    const payload = buildCompanyUpdatePayload(values);
    const { error } = await supabase.from("companies").update(payload).eq("id", query.data.id);
    if (error) {
      toast.error(mapAuthErrorMessage(error));
      return;
    }
    toast.success("Der Unternehmensname wurde aktualisiert.");
    form.reset(values);
    queryClient.invalidateQueries({ queryKey: ["company"] });
    // The DB trigger (companies_sync_profile_company) keeps profiles.company
    // in sync as a side effect of the update above; refresh every cached
    // copy of `profiles` (sidebar, dashboard greeting) so none goes stale.
    invalidateProfileCaches(queryClient);
  }

  if (query.isLoading) {
    return (
      <SettingsSection
        title="Unternehmen"
        description="Diese Angaben werden innerhalb deines EstateAI-Kontos verwendet."
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Unternehmen"
        description="Diese Angaben werden innerhalb deines EstateAI-Kontos verwendet."
      >
        {!canEditCompany && (
          <p className="text-sm text-muted-foreground">
            Nur ein Administrator deines Unternehmens kann diese Angaben ändern.
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unternehmensname</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEditCompany} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Begrüßung</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} disabled={!canEditCompany} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="response_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rückmeldezeitraum im Chat</FormLabel>
                  <FormDescription>
                    Dieser Zeitraum wird Besuchern im Chat genannt, z. B. „Ein Makler meldet sich
                    bei Ihnen innerhalb von 24 Stunden."
                  </FormDescription>
                  <FormControl>
                    <select
                      {...field}
                      disabled={!canEditCompany}
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                      )}
                    >
                      {RESPONSE_TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="privacy_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Datenschutz-URL (optional)</FormLabel>
                  <FormDescription>
                    Link zur Datenschutzerklärung Ihrer eigenen Website. Wird Besuchern im
                    eingebetteten Chat-Widget angezeigt. Ohne Angabe erscheint kein Link.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://ihre-website.de/datenschutz"
                      {...field}
                      disabled={!canEditCompany}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="terms_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link zu Ihren AGB</FormLabel>
                  <FormDescription>
                    Dieser Link wird im EstateAI-Widget angezeigt. Verwenden Sie die AGB-Seite Ihres
                    Unternehmens.
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="https://www.ihre-maklerseite.de/agb"
                      {...field}
                      disabled={!canEditCompany}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {canEditCompany && (
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!form.formState.isDirty || form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Wird gespeichert …" : "Änderungen speichern"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!form.formState.isDirty || form.formState.isSubmitting}
                  onClick={() => form.reset()}
                >
                  Verwerfen
                </Button>
              </div>
            )}
          </form>
        </Form>
      </SettingsSection>

      <ComingSoonSettingsCard
        title="Weitere Unternehmens-Einstellungen"
        fields={["Unternehmenslogo", "Geschäftsadresse", "Website", "Kontaktdaten"]}
      />
    </div>
  );
}
