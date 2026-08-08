import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Multiple *.integration.test.ts files share one real, connected
    // Supabase project and (for the E-Mail channel, slice 7) global fetch
    // stubbing. Some worker-level tests intentionally call the *global*
    // (non-conversation-scoped) processDueFollowups/handleFollowupWorkerRequest,
    // which claims whatever is due across the entire table — exactly
    // mirroring the real single-scheduler production behavior. Running test
    // files in parallel let two files' due fixtures race for the same
    // global claim, and let one file's vi.stubGlobal("fetch", ...) leak
    // into another file running in the same worker at the same moment —
    // both genuinely observed (see ROADMAP.md, Product Track slice 7).
    // Sequential file execution is the correct fix, not a workaround: it
    // matches the real system's single-scheduler-at-a-time reality.
    fileParallelism: false,
  },
});
