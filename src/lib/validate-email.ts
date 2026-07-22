export const PLUS_ADDRESS_ERROR =
  "Bitte verwende deine normale E-Mail-Adresse. E-Mail-Aliase mit '+' werden nicht unterstützt.";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPlusAddressed(email: string): boolean {
  const at = email.indexOf("@");
  const localPart = at === -1 ? email : email.slice(0, at);
  return localPart.includes("+");
}
