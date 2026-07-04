import { createAnthropic } from "@ai-sdk/anthropic";

export function createAnthropicProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}
