import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { CompanySettingsForm } from "@/components/settings/CompanySettingsForm";
import { ComingSoonSettingsCard } from "@/components/settings/ComingSoonSettingsCard";
import { BillingSettingsSection } from "@/components/settings/BillingSettingsSection";
import { FeedbackSettingsSection } from "@/components/settings/FeedbackSettingsSection";
import { useUnsavedChangesGuard } from "@/lib/settings/use-unsaved-changes-guard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Einstellungen – EstateAI" }] }),
  component: SettingsPage,
});

const TABS = [
  { value: "profil", label: "Profil" },
  { value: "unternehmen", label: "Unternehmen" },
  { value: "feedback", label: "Feedback" },
  { value: "sicherheit", label: "Sicherheit" },
  { value: "benachrichtigungen", label: "Benachrichtigungen" },
  { value: "abo", label: "Abo & Abrechnung" },
  { value: "integrationen", label: "Integrationen" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("profil");
  const [pendingTab, setPendingTab] = useState<TabValue | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [companyDirty, setCompanyDirty] = useState(false);

  const hasUnsavedChanges = profileDirty || companyDirty;
  const blocker = useUnsavedChangesGuard(hasUnsavedChanges);

  function requestTabChange(next: string) {
    const nextTab = next as TabValue;
    if (nextTab === activeTab) return;
    const activeTabIsDirty =
      (activeTab === "profil" && profileDirty) || (activeTab === "unternehmen" && companyDirty);
    if (activeTabIsDirty) {
      setPendingTab(nextTab);
    } else {
      setActiveTab(nextTab);
    }
  }

  function confirmDiscardAndSwitch() {
    if (activeTab === "profil") setProfileDirty(false);
    if (activeTab === "unternehmen") setCompanyDirty(false);
    if (pendingTab) setActiveTab(pendingTab);
    setPendingTab(null);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <SettingsPageHeader
        title="Einstellungen"
        subtitle="Verwalte dein Profil, dein Unternehmen und deine Kontoeinstellungen."
      />

      <Tabs value={activeTab} onValueChange={requestTabChange}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profil" className="mt-6">
          <ProfileSettingsForm onDirtyChange={setProfileDirty} />
        </TabsContent>

        <TabsContent value="unternehmen" className="mt-6">
          <CompanySettingsForm onDirtyChange={setCompanyDirty} />
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <FeedbackSettingsSection />
        </TabsContent>

        <TabsContent value="sicherheit" className="mt-6">
          <ComingSoonSettingsCard
            title="Sicherheit"
            description="Verwalte Passwort, Zwei-Faktor-Authentifizierung und aktive Sitzungen."
            fields={[
              "Passwort ändern",
              "Zwei-Faktor-Authentifizierung",
              "Aktive Sitzungen",
              "Konto löschen",
            ]}
          />
        </TabsContent>

        <TabsContent value="benachrichtigungen" className="mt-6">
          <ComingSoonSettingsCard
            title="Benachrichtigungen"
            description="Lege fest, über welche Aktivitäten du informiert wirst."
            fields={[
              "Neue Leads",
              "Terminvereinbarungen",
              "Trial- und Abonnementereignisse",
              "Systemmeldungen",
              "E-Mail-Benachrichtigungen",
            ]}
          />
        </TabsContent>

        <TabsContent value="abo" className="mt-6">
          <BillingSettingsSection />
        </TabsContent>

        <TabsContent value="integrationen" className="mt-6">
          <ComingSoonSettingsCard
            title="Integrationen"
            description="Verbinde EstateAI mit deinen bestehenden Werkzeugen."
            fields={[
              "API-Schlüssel",
              "Webhooks",
              "CRM-Verbindungen",
              "Kalender",
              "E-Mail",
              "Website-Widget",
            ]}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => !open && setPendingTab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Änderungen</AlertDialogTitle>
            <AlertDialogDescription>
              Du hast ungespeicherte Änderungen. Möchtest du wirklich wechseln, ohne zu speichern?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTab(null)}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAndSwitch}>
              Verwerfen und wechseln
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Änderungen</AlertDialogTitle>
            <AlertDialogDescription>
              Du hast ungespeicherte Änderungen. Möchtest du die Seite wirklich verlassen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Verlassen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
