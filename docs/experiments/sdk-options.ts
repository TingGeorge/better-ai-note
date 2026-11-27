// Usage: INVIC_HOME=<tmp> bun exp.ts <mode> [arg]
import { AbortError, query, type Options, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

const CLAUDE = "/path/to/claude";
const MCP = "/path/to/repo/build/Invic.app/Contents/MacOS/excalidraw-mcp";
const HOME = process.env.INVIC_HOME!;
const SIX = ["get_scene", "render_image", "add_elements", "update_elements", "delete_elements", "add_mermaid"].map(
  (name) => `mcp__canvas__${name}`,
);
const BLOCKED = ["mcp__canvas__clear_canvas", "mcp__canvas__zoom_to_fit"];

const base: Options = {
  pathToClaudeCodeExecutable: CLAUDE,
  settingSources: [],
  mcpServers: { canvas: { command: MCP, env: { INVIC_HOME: HOME } } },
  ...(process.env.MODEL ? { model: process.env.MODEL } : {}),
};

// Tool-restriction candidates for question 1
const configs: Record<string, Options> = {
  A_tools_allowed: { tools: [], allowedTools: SIX },
  B_tools_allowed_disallowed: { tools: [], allowedTools: SIX, disallowedTools: BLOCKED },
  C_tools_disallowed_dontAsk: { tools: [], disallowedTools: BLOCKED, permissionMode: "dontAsk" },
  D_allowed_only: { allowedTools: SIX },
  E_tools_allowed_dontAsk: { tools: [], allowedTools: SIX, permissionMode: "dontAsk" },
  F_tools_six: { tools: SIX },
  G_full: { tools: [], allowedTools: SIX, disallowedTools: BLOCKED, permissionMode: "dontAsk" },
  H_full_strict: { tools: [], allowedTools: SIX, disallowedTools: BLOCKED, permissionMode: "dontAsk", strictMcpConfig: true },
  I_init_delivery: {
    tools: [],
    allowedTools: SIX,
    disallowedTools: BLOCKED,
    permissionMode: "dontAsk",
    mcpServersDelivery: "initialize",
  },
};

const [mode, arg] = process.argv.slice(2);
const t0 = performance.now();
const ms = () => `${Math.round(performance.now() - t0)}ms`;

// A streaming prompt: yields the given messages, then (if hold) never finishes
async function* stream(messages: SDKUserMessage[], hold: Promise<void>) {
  for (const message of messages) {
    yield message;
  }
  await hold;
}

function userText(text: string): SDKUserMessage {
  return { type: "user", parent_tool_use_id: null, message: { role: "user", content: text } };
}

function ps(label: string) {
  const out = Bun.spawnSync(["ps", "-o", "pid,ppid,command", "-ax"]).stdout.toString();
  const mine = out
    .split("\n")
    .filter((line) => /\.local\/bin\/claude|Invic\.app/.test(line) && !line.includes("ps -o"));
  console.log(`[ps ${label}] own pid ${process.pid}\n  ` + mine.join("\n  "));
}

async function run(options: Options, prompt: string | AsyncIterable<SDKUserMessage>, opts: { abortOn?: string } = {}) {
  const abortController = new AbortController();
  const q = query({ prompt, options: { ...base, ...options, abortController } });
  try {
    for await (const m of q as AsyncIterable<any>) {
      if (m.type === "system" && m.subtype === "init") {
        console.log(`${ms()} init model=${m.model} permissionMode=${m.permissionMode} cli=${m.claude_code_version}`);
        console.log(`  tools=${JSON.stringify(m.tools)}`);
        console.log(`  mcp_servers=${JSON.stringify(m.mcp_servers)}`);
        if (opts.abortOn === "init") {
          abortController.abort();
        }
        continue;
      }
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "tool_use") {
            console.log(`${ms()} assistant tool_use ${block.name} ${JSON.stringify(block.input).slice(0, 80)}`);
            if (opts.abortOn === "interrupt") {
              console.log(`${ms()} calling interrupt()`);
              const answer = await q.interrupt();
              console.log(`${ms()} interrupt() resolved ${JSON.stringify(answer)}`);
              if (process.env.ALSO_ABORT) {
                console.log(`${ms()} calling abort()`);
                abortController.abort();
              }
            }
            if (opts.abortOn === "tool_use") {
              ps("before abort");
              console.log(`${ms()} calling abort()`);
              abortController.abort();
            }
          } else if (block.type === "text") {
            console.log(`${ms()} assistant text: ${block.text.slice(0, 300)}`);
          } else {
            console.log(`${ms()} assistant ${block.type}`);
          }
        }
        if (m.error) {
          console.log(`  assistant.error=${m.error}`);
        }
        continue;
      }
      if (m.type === "user") {
        for (const block of Array.isArray(m.message.content) ? m.message.content : []) {
          if (block.type === "tool_result") {
            console.log(`${ms()} tool_result is_error=${block.is_error} ${JSON.stringify(block.content).slice(0, 200)}`);
          }
        }
        continue;
      }
      if (m.type === "result") {
        const { usage, modelUsage, ...rest } = m;
        console.log(`${ms()} result subtype=${m.subtype} is_error=${m.is_error} terminal_reason=${m.terminal_reason} num_turns=${m.num_turns} errors=${JSON.stringify(m.errors)} result=${JSON.stringify(m.result)?.slice(0, 200)}`);
        console.log(`  full: ${JSON.stringify(rest)}`);
        console.log(`  usage=${JSON.stringify(usage)}`);
        console.log(`  modelUsage=${JSON.stringify(modelUsage)}`);
        continue;
      }
      console.log(`${ms()} other ${m.type}/${m.subtype ?? ""} ${JSON.stringify(m).slice(0, 200)}`);
    }
    console.log(`${ms()} iterator finished normally`);
  } catch (error: any) {
    console.log(`${ms()} THROWN instanceof AbortError=${error instanceof AbortError} name=${error?.name} ctor=${error?.constructor?.name} message=${JSON.stringify(String(error?.message))}`);
  }
}

const never = new Promise<void>(() => {});

switch (mode) {
  case "list": {
    // Init without sending any user message
    await run(configs[arg], stream([], never), { abortOn: "init" });
    break;
  }
  case "listmsg": {
    await run({ ...configs[arg], maxTurns: 1 }, "say ok", { abortOn: "init" });
    break;
  }
  case "call": {
    const prompt = "Call the zoom_to_fit tool once, then reply with exactly what happened in one sentence.";
    await run({ ...configs[arg], maxTurns: 3 }, prompt);
    break;
  }
  case "callscene": {
    const prompt = "Call get_scene once, then reply with what happened in one sentence.";
    await run({ ...configs[arg], maxTurns: 3 }, prompt);
    break;
  }
  case "callbuiltin": {
    const prompt = "Use the Bash tool to run `echo hi`, then reply with what happened in one sentence.";
    await run({ ...configs[arg], maxTurns: 3 }, prompt);
    break;
  }
  case "badmcp": {
    base.mcpServers = { canvas: { command: "/nonexistent/excalidraw-mcp" } };
    await run({ ...configs.G_full, maxTurns: 1 }, "say ok");
    break;
  }
  case "premsg": {
    // Control requests before any user message: no model turn is spent
    if (arg === "bad") {
      base.mcpServers = { canvas: { command: "/nonexistent/excalidraw-mcp" } };
    }
    const abortController = new AbortController();
    const q = query({ prompt: stream([], never), options: { ...base, ...configs.G_full, abortController } });
    const init = await q.initializationResult();
    console.log(`${ms()} initializationResult mcp_servers_applied=${init.mcp_servers_applied}`);
    console.log(`  models=${JSON.stringify(init.models.map((m: any) => ({ value: m.value, resolved: m.resolvedModel ?? m.canonicalModel, name: m.displayName })))}`);
    let status = await q.mcpServerStatus();
    while (status.some((s) => s.status === "pending") && performance.now() - t0 < 15000) {
      await Bun.sleep(100);
      status = await q.mcpServerStatus();
    }
    console.log(`${ms()} mcpServerStatus=${JSON.stringify(status.map((s) => ({ name: s.name, status: s.status, error: s.error, tools: s.tools?.map((t: any) => t.name) })))}`);
    abortController.abort();
    try {
      for await (const m of q) {
        console.log(`${ms()} drained ${m.type}/${(m as any).subtype ?? ""}`);
      }
    } catch (error: any) {
      console.log(`${ms()} THROWN ${error?.message}`);
    }
    break;
  }
  case "cancel": {
    const prompt =
      "Call get_scene five times, exactly one call per turn (never two in one message). Then say done.";
    await run({ ...configs.G_full, maxTurns: 8 }, prompt, { abortOn: arg === "interrupt" ? "interrupt" : "tool_use" });
    ps("right after settle");
    const children = () => Bun.spawnSync(["pgrep", "-P", String(process.pid)]).stdout.toString().trim();
    while (children()) {
      await Bun.sleep(50);
    }
    console.log(`${ms()} no child processes left`);
    ps("after children gone");
    break;
  }
  case "image": {
    const data = Buffer.from(await Bun.file(`${import.meta.dir}/test.png`).arrayBuffer()).toString("base64");
    const message: SDKUserMessage = {
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          { type: "text", text: "Describe this image in one short sentence: the words and the shape." },
          { type: "image", source: { type: "base64", media_type: "image/png", data } },
        ],
      },
    };
    const sys = arg === "sys" ? { systemPrompt: "Always answer in French." } : {};
    await run({ ...configs.G_full, maxTurns: 1, ...sys }, stream([message], Promise.resolve()));
    break;
  }
  case "maxturns": {
    await run({ ...configs.G_full, maxTurns: 1 }, "Call get_scene, then call render_image, then summarize.");
    break;
  }
  case "badpath": {
    base.pathToClaudeCodeExecutable = "/nonexistent/claude";
    await run(configs.G_full, "say ok");
    break;
  }
  case "badmodel": {
    await run({ ...configs.G_full, maxTurns: 1, model: "claude-nonexistent-9" }, "say ok");
    break;
  }
  case "model": {
    const model = arg === "default" ? {} : { model: arg };
    await run({ ...configs.G_full, maxTurns: 1, ...model }, "say ok");
    break;
  }
  default:
    console.log(`unknown mode ${mode}`);
}
