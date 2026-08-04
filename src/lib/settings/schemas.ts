import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/utils";
import { PLUS_ADDRESS_ERROR, isPlusAddressed, normalizeEmail } from "@/lib/validate-email";
import { RESPONSE_TIME_OPTIONS, type ResponseTimeValue } from "@/lib/response-time";

const RESPONSE_TIME_VALUES = RESPONSE_TIME_OPTIONS.map((o) => o.value) as [
  ResponseTimeValue,
  ...ResponseTimeValue[],
];

function isNotWhitespaceOnly(value: string): boolean {
  return value.length > 0;
}

export const profileSettingsSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Bitte geben Sie mindestens 2 Zeichen ein.")
    .max(120, "Maximal 120 Zeichen.")
    .refine(isNotWhitespaceOnly, "Der Name darf nicht leer sein."),
});

export type ProfileSettingsFormValues = z.infer<typeof profileSettingsSchema>;

// Validation only. Do not use `.email` from a parsed result to talk to
// Supabase — always go through normalizeEmail()/isPlusAddressed() from
// src/lib/validate-email.ts (the single source of truth reused by auth.tsx,
// forgot-password.tsx) so plus-address handling never diverges.
export const emailChangeSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "E-Mail-Adresse zu lang.")
    .transform((v) => normalizeEmail(v))
    .refine((v) => v.length > 0, "E-Mail-Adresse erforderlich.")
    .pipe(z.string().email("Bitte eine gültige E-Mail-Adresse eingeben."))
    .refine((v) => !isPlusAddressed(v), { message: PLUS_ADDRESS_ERROR }),
});

export type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;

export const companySettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Bitte geben Sie mindestens 2 Zeichen ein.")
    .max(150, "Maximal 150 Zeichen.")
    .refine(isNotWhitespaceOnly, "Der Firmenname darf nicht leer sein."),
  greeting: z.string().trim().max(2000, "Maximal 2000 Zeichen."),
  response_time: z.enum(RESPONSE_TIME_VALUES),
  privacy_url: z
    .string()
    .trim()
    .refine((v) => !v || isSafeHttpUrl(v), {
      message: "Bitte eine gültige http(s)-URL für die Datenschutzerklärung angeben.",
    }),
  terms_url: z
    .string()
    .trim()
    .refine((v) => !v || isSafeHttpUrl(v), {
      message:
        "Bitte geben Sie eine vollständige URL ein, zum Beispiel https://www.ihre-maklerseite.de/agb.",
    }),
});

export type CompanySettingsFormValues = z.infer<typeof companySettingsSchema>;
