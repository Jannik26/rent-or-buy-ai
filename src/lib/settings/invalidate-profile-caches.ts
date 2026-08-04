import type { QueryClient } from "@tanstack/react-query";

/**
 * The codebase has three separate React Query keys that each independently
 * read overlapping `profiles` columns: `["sidebar-profile"]` (app-sidebar.tsx
 * / MobileNav), `["profile"]` (dashboard.tsx's "Willkommen zurück, ..."
 * greeting), and `["profile-settings"]` (this feature's own forms). There is
 * no single shared query to invalidate — call this after any write that
 * changes `profiles.full_name`/`company`/`email` so none of the three go
 * stale relative to the others.
 */
export function invalidateProfileCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
  queryClient.invalidateQueries({ queryKey: ["sidebar-profile"] });
  queryClient.invalidateQueries({ queryKey: ["profile"] });
}
