import type { AgentTool } from "@earendil-works/pi-agent-core";
import { obj, oneOf, unknown } from "@earendil-works/pi-schema";

import { BLOCK_KINDS, checkBlock, type Block } from "./types.ts";

const checkBlockParameters = obj({
  kind: oneOf(BLOCK_KINDS, { description: "Which kind of block this is" }),
  data: unknown({ description: "The block's data, in the shape the system prompt gives for this kind" }),
});

// The model hands in its final block through this tool. A wrong shape comes back as a tool
// error listing the problems, so the model can fix it and call again.
export function createCheckBlockTool(onValidBlock: (block: Block) => void): AgentTool<typeof checkBlockParameters> {
  return {
    name: "check_block",
    label: "Check block",
    description:
      "Submit the finished block. It is checked against the shape for its kind. " +
      "If it is wrong you get the problems back and must fix them and call this tool again. " +
      "When it is accepted you are done.",
    parameters: checkBlockParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const result = checkBlock(params);
      if (!result.ok) {
        throw new Error(`The block was rejected:\n- ${result.problems.join("\n- ")}`);
      }

      onValidBlock(result.block);
      return {
        content: [{ type: "text", text: "Block accepted." }],
        details: undefined,
        // Nothing left for the model to do once the block is accepted
        terminate: true,
      };
    },
  };
}
