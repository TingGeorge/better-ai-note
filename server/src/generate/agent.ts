import { Agent } from "@earendil-works/pi-agent-core";
import type { Api, Model, Models } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

import { buildUserText } from "./prompt.ts";
import type { GenerateInput } from "./request.ts";
import { createCheckBlockTool } from "./tools.ts";
import type { Block } from "./types.ts";

export type ModelSetup = {
  models: Models;
  model: Model<Api>;
};

export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";

// One model call plus a few retries after check_block rejects the block. More than this
// means the model is stuck, and every extra turn costs the owner money.
const MAX_TURNS = 4;

export class GenerateError extends Error {}

// The provider's own key variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...) is read by pi-ai
export function modelFromEnv(): ModelSetup {
  const provider = Bun.env.MODEL_PROVIDER || DEFAULT_PROVIDER;
  const modelId = Bun.env.MODEL_ID || DEFAULT_MODEL_ID;

  const models = builtinModels();
  const model = models.getModel(provider, modelId);
  if (!model) {
    throw new GenerateError(`Unknown model "${modelId}" for provider "${provider}". Check MODEL_PROVIDER and MODEL_ID.`);
  }
  if (!model.input.includes("image")) {
    throw new GenerateError(`Model "${modelId}" cannot read images. Pick a multimodal model in MODEL_ID.`);
  }
  return { models, model };
}

export type RunOptions = {
  input: GenerateInput;
  setup: ModelSetup;
  systemPrompt: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
};

// A fresh agent per request, thrown away afterwards: the server keeps no state
export async function runGenerateAgent({ input, setup, systemPrompt, onDelta, signal }: RunOptions): Promise<Block> {
  let block: Block | undefined;
  let turns = 0;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: setup.model,
      tools: [createCheckBlockTool((accepted) => (block = accepted))],
    },
    streamFn: setup.models.streamSimple.bind(setup.models),
    finishTurn: () => {
      turns += 1;
      if (block || turns >= MAX_TURNS) {
        return { action: "end" };
      }
    },
  });

  agent.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      onDelta(event.assistantMessageEvent.delta);
    }
  });

  const abort = () => agent.abort();
  signal?.addEventListener("abort", abort);
  try {
    await agent.prompt(buildUserText(input.userRequest), [input.image]);
  } finally {
    signal?.removeEventListener("abort", abort);
  }

  if (block) {
    return block;
  }
  if (agent.state.errorMessage) {
    throw new GenerateError(`Model request failed: ${agent.state.errorMessage}`);
  }
  if (turns >= MAX_TURNS) {
    throw new GenerateError(`The model did not produce a valid block in ${MAX_TURNS} tries`);
  }
  throw new GenerateError("The model finished without producing a block");
}
