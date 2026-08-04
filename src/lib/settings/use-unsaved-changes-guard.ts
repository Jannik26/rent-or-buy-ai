import { useBlocker } from "@tanstack/react-router";

/**
 * Blocks navigating away from the current route (sidebar links, back
 * button, etc.) and the browser's close/reload prompt while `isDirty` is
 * true. Consumers render an AlertDialog gated on `status === "blocked"`,
 * calling `proceed()`/`reset()` to discard or stay.
 *
 * Does NOT cover switching tabs within the same route (not a router
 * navigation) — that case is handled locally where the tabs live.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  return useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: true,
    withResolver: true,
  });
}
