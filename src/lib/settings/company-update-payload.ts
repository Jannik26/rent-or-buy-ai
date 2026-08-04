import type { ResponseTimeValue } from "@/lib/response-time";
import type { CompanySettingsFormValues } from "@/lib/settings/schemas";

export type CompanyUpdatePayload = {
  name: string;
  greeting: string;
  response_time: ResponseTimeValue;
  privacy_url: string | null;
  terms_url: string | null;
};

/**
 * Narrow, explicit update payload for `companies` — only ever these 5 keys,
 * regardless of what the form values object happens to contain, so a future
 * field added to the form can never silently leak into the Supabase update
 * (e.g. an id/owner_id/subscription field).
 */
export function buildCompanyUpdatePayload(values: CompanySettingsFormValues): CompanyUpdatePayload {
  const trimmedPrivacyUrl = values.privacy_url.trim();
  const trimmedTermsUrl = values.terms_url.trim();
  return {
    name: values.name.trim(),
    greeting: values.greeting.trim(),
    response_time: values.response_time,
    privacy_url: trimmedPrivacyUrl || null,
    terms_url: trimmedTermsUrl || null,
  };
}
