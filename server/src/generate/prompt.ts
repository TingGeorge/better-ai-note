import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dir, "../../prompts");

// Read on every request so an edited prompt takes effect without a restart
export async function loadSystemPrompt(): Promise<string> {
  return Bun.file(join(PROMPTS_DIR, "generate.md")).text();
}

export function buildUserText(userRequest: string | undefined): string {
  const trimmed = userRequest?.trim();
  if (!trimmed) {
    return "The person did not write a request. Decide yourself which block helps most with what they circled.";
  }
  return `The person's request: ${trimmed}`;
}
