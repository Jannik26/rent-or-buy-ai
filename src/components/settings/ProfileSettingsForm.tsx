import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  profileSettingsSchema,
  emailChangeSchema,
  type ProfileSettingsFormValues,
  type EmailChangeFormValues,
} from "@/lib/settings/schemas";
import { classifyEmailChangeResult } from "@/lib/settings/email-change";
import { mapAuthErrorMessage } from "@/lib/settings/auth-errors";
import { invalidateProfileCaches } from "@/lib/settings/invalidate-profile-caches";
import { normalizeEmail } from "@/lib/validate-email";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ProfileData = { id: string; full_name: string | null; email: string | null };

async function fetchProfileSettings(): Promise<ProfileData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  // The auth user's email is the authoritative, confirmed email — not
  // profiles.email, which can lag behind an in-flight/unconfirmed change.
  return { id: user.id, full_name: profile?.full_name ?? null, email: user.email ?? null };
}

export function ProfileSettingsForm({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["profile-settings"], queryFn: fetchProfileSettings });

  const nameForm = useForm<ProfileSettingsFormValues>({
    resolver: zodResolver(profileSettingsSchema),
    defaultValues: { full_name: "" },
  });
  const emailForm = useForm<EmailChangeFormValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { email: "" },
  });

  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !query.data) return;
    hydrated.current = true;
    nameForm.reset({ full_name: query.data.full_name ?? "" });
    emailForm.reset({ email: query.data.email ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const nameDirty = nameForm.formState.isDirty;
  const emailDirty = emailForm.formState.isDirty;
  useEffect(() => {
    onDirtyChange(nameDirty || emailDirty);
  }, [nameDirty, emailDirty, onDirtyChange]);

  const [emailStatus, setEmailStatus] = useState<
    { type: "idle" } | { type: "pending"; requestedEmail: string }
  >({ type: "idle" });

  async function saveName(values: ProfileSettingsFormValues) {
    if (!query.data) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: values.full_name })
      .eq("id", query.data.id);
    if (error) {
      toast.error(mapAuthErrorMessage(error));
      return;
    }
    toast.success("Deine Profildaten wurden aktualisiert.");
    nameForm.reset({ full_name: values.full_name });
    invalidateProfileCaches(queryClient);
  }

  async function saveEmail(values: EmailChangeFormValues) {
    const currentEmail = query.data?.email ?? null;
    const requested = normalizeEmail(values.email);

    if (requested === normalizeEmail(currentEmail ?? "")) {
      toast.message("Diese E-Mail-Adresse ist bereits aktuell.");
      emailForm.reset({ email: requested });
      return;
    }

    const { data, error } = await supabase.auth.updateUser({ email: requested });
    if (error) {
      toast.error(mapAuthErrorMessage(error));
      return;
    }

    const outcome = classifyEmailChangeResult(currentEmail, requested, data.user);
    if (outcome === "pending") {
      setEmailStatus({ type: "pending", requestedEmail: requested });
      toast.success("Wir haben eine Bestätigungs-E-Mail an deine neue Adresse gesendet.");
      // Keep the form's own dirty state clean (the user's intent was
      // submitted successfully) without pretending the address already
      // changed — the input still shows what was requested, the banner
      // below explains the confirmed address hasn't changed yet.
      emailForm.reset({ email: requested });
    } else if (outcome === "changed") {
      setEmailStatus({ type: "idle" });
      toast.success("Deine Profildaten wurden aktualisiert.");
      emailForm.reset({ email: requested });
      invalidateProfileCaches(queryClient);
    } else {
      emailForm.reset({ email: requested });
    }
  }

  if (query.isLoading) {
    return (
      <SettingsSection title="Profil" description="Verwalte deine persönlichen Kontoinformationen.">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="Profil" description="Verwalte deine persönlichen Kontoinformationen.">
        <Form {...nameForm}>
          <form onSubmit={nameForm.handleSubmit(saveName)} className="space-y-4">
            <FormField
              control={nameForm.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vollständiger Name</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!nameForm.formState.isDirty || nameForm.formState.isSubmitting}
              >
                {nameForm.formState.isSubmitting ? "Wird gespeichert …" : "Änderungen speichern"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!nameForm.formState.isDirty || nameForm.formState.isSubmitting}
                onClick={() => nameForm.reset()}
              >
                Verwerfen
              </Button>
            </div>
          </form>
        </Form>

        <Form {...emailForm}>
          <form
            onSubmit={emailForm.handleSubmit(saveEmail)}
            className="space-y-4 border-t border-border pt-5"
          >
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail-Adresse</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} autoComplete="email" />
                  </FormControl>
                  <FormDescription>
                    Bestätige deine neue E-Mail-Adresse über den Link, den wir dir senden. Bis dahin
                    bleibt deine bisherige E-Mail-Adresse aktiv.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {emailStatus.type === "pending" && (
              <div
                role="status"
                className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
              >
                Bestätige deine neue E-Mail-Adresse über den Link, den wir dir gesendet haben. Bis
                dahin bleibt deine bisherige E-Mail-Adresse aktiv.
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!emailForm.formState.isDirty || emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting ? "Wird gespeichert …" : "Änderungen speichern"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!emailForm.formState.isDirty || emailForm.formState.isSubmitting}
                onClick={() => emailForm.reset()}
              >
                Verwerfen
              </Button>
            </div>
          </form>
        </Form>
      </SettingsSection>

      <ComingSoonSettingsCard
        title="Weitere Profil-Einstellungen"
        fields={["Profilbild", "Telefonnummer", "Sprache", "Zeitzone"]}
      />
    </div>
  );
}
