import { query } from "@anthropic-ai/claude-agent-sdk";

const imageBase64 = Buffer.from(await Bun.file(process.env.IMG!).arrayBuffer()).toString("base64");

async function* messages() {
  yield {
    type: "user" as const,
    session_id: "",
    parent_tool_use_id: null,
    message: {
      role: "user" as const,
      content: [
        { type: "image" as const, source: { type: "base64" as const, media_type: "image/webp" as const, data: imageBase64 } },
        { type: "text" as const, text: "What words are written in this image? Answer in one short sentence." },
      ],
    },
  };
}

const started = Date.now();
for await (const message of query({
  prompt: messages(),
  options: { pathToClaudeCodeExecutable: process.env.CLAUDE_BIN, tools: [], settingSources: [], maxTurns: 1 },
})) {
  if (message.type === "system" && message.subtype === "init") {
    console.log("cli:", (message as any).claude_code_version, "tools:", JSON.stringify((message as any).tools).slice(0, 200));
  }
  if (message.type === "result") {
    console.log("result:", message.subtype, "|", (message as any).result, "| ms:", Date.now() - started);
  }
}
