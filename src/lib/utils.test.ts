import { describe, expect, it } from "vitest";
import { isSafeHttpUrl } from "@/lib/utils";

describe("isSafeHttpUrl", () => {
  it.each(["https://www.ihre-maklerseite.de/agb", "http://localhost:3000/agb"])(
    "accepts %s",
    (value) => {
      expect(isSafeHttpUrl(value)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "www.ihre-maklerseite.de/agb",
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(isSafeHttpUrl(value)).toBe(false);
  });
});
