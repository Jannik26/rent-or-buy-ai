import { useBlocker } from "@tanstack/react-router";

/**
 * Blocks navigating away from the current route (sidebar links, back
 * button, etc.) and the browser's close/reload prompt while `isDirty` is
 * true. Consumers render an AlertDialog gated on `status === "blocked"`,
 * calling `proceed()`/`reset()` to discard or stay.
 *
 * `enableBeforeUnload` must be a live function, not a static `true`: the
 * underlying history package's native `beforeunload` listener reads
 * `blocker.enableBeforeUnload` directly and independently of
 * `shouldBlockFn` (which only gates in-app/SPA navigations). A static
 * `true` here would arm the native "Leave site?" prompt unconditionally
 * from the moment this hook mounts, regardless of whether anything is
 * actually dirty — which is exactly what happened before this fix: saving
 * correctly reset `isDirty`, but a hard reload/URL change right after still
 * triggered the browser prompt every time.
 *
 * Does NOT cover switching tabs within the same route (not a router
 * navigation) — that case is handled locally where the tabs live.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  return useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });
}
