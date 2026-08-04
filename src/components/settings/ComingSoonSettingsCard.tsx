import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/SettingsSection";

/**
 * Inert placeholder for prepared-but-not-yet-available settings. Renders no
 * interactive elements at all (no inputs, no buttons) so nothing ever looks
 * clickable while silently doing nothing.
 */
export function ComingSoonSettingsCard({
  title,
  description,
  fields,
}: {
  title: string;
  description?: string;
  fields: string[];
}) {
  return (
    <SettingsSection title={title} description={description}>
      <Badge variant="secondary">Demnächst verfügbar</Badge>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {fields.map((field) => (
          <li key={field} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            {field}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
