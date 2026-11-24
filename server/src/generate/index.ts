import { GenerateError, modelFromEnv, runGenerateAgent, type ModelSetup } from "./agent.ts";
import { loadSystemPrompt } from "./prompt.ts";
import { parseGenerateRequest } from "./request.ts";
import { sseResponse } from "./sse.ts";

export type GenerateDeps = {
  // Called per request, so a missing API key or model shows up as an error event, not a crash
  getModelSetup: () => ModelSetup;
  loadSystemPrompt: () => Promise<string>;
};

let cachedSetup: ModelSetup | undefined;
const defaultDeps: GenerateDeps = {
  getModelSetup: () => (cachedSetup ??= modelFromEnv()),
  loadSystemPrompt,
};

// POST /generate: circled image + optional request text in, SSE out.
// Events: `delta` { text } while the model writes, then `done` { block } or `error` { error }.
export function createGenerate(deps: GenerateDeps = defaultDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = await parseGenerateRequest(request);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    return sseResponse(request.signal, async (send) => {
      try {
        const block = await runGenerateAgent({
          input: parsed.input,
          setup: deps.getModelSetup(),
          systemPrompt: await deps.loadSystemPrompt(),
          onDelta: (text) => send("delta", { text }),
          signal: request.signal,
        });
        send("done", { block });
      } catch (error) {
        // Only our own messages go to the client; anything else may carry provider internals
        const message = error instanceof GenerateError ? error.message : "Generation failed";
        if (!(error instanceof GenerateError)) {
          console.error("generate failed:", error);
        }
        send("error", { error: message });
      }
    });
  };
}

export const generate = createGenerate();

// TODO: same path as generate, with the previous result and the user's comment added.
export function revise(): Response {
  return Response.json({ error: "POST /revise is not implemented yet" }, { status: 501 });
}
