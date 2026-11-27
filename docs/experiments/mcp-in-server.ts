// Experiment: the canvas MCP in TypeScript, inside the Bun server, with no Swift excalidraw-mcp.
// Bun talks to the Invic app's socket itself and gives the tools to the Agent SDK as an
// in-process MCP server (createSdkMcpServer, type "sdk").
//
// Run from a folder where @anthropic-ai/claude-agent-sdk 0.3.332 (and its zod 4 and
// @modelcontextprotocol/sdk 1.32) resolve; they are not in server/package.json yet:
//   INVIC_HOME=<short dir holding bridge.sock> CLAUDE_PATH=~/.local/bin/claude \
//     bun mcp-in-server.ts <mode> [arg]
// The socket path must stay under 104 bytes (macOS), so use a short dir such as /tmp/invic-exp.
// Modes without a model turn: socket, mcp, share, restart. With haiku: list <full|noTools|noAllowed>,
// draw, image [big], cancel, concurrent. The app (or web/test/fake-app.mjs) must have a drawing open.
//
// Observed 2026-11-28 (macOS, Bun 1.4.0, SDK 0.3.332, Claude Code 2.1.332, fake app and build/Invic.app):
// - socket: Bun.connect({ unix }) works. Unlike Node, write() does not buffer: it returns how many
//   bytes the kernel took (a 272 kB line went out in 35 writes), so the rest waits for drain().
//   5 concurrent calls on one connection come back matched by id. 96 000 Chinese characters
//   round-trip exactly with the real app. (fake-app.mjs corrupts them: it does `buf += chunk` on
//   Buffers, so a character split across chunks breaks; Node's client sees the same.)
// - mcp: z.looseObject keeps unknown style fields (backgroundColor reached the app); the JSON
//   Schema gets additionalProperties: {}. A wrong enum is rejected by the MCP layer (-32602).
// - share: one createSdkMcpServer() instance cannot serve two queries at once; the second query
//   silently has no canvas server (mcpServerStatus() is []). After close() it can be reused.
//   So: one instance per query, one bridge connection for all.
// - list full: init tools are exactly the 3 allowed mcp__canvas__* (zoom_to_fit is removed by
//   disallowedTools), mcp_servers [{"name":"canvas","status":"connected","source":"sdk"}].
//   noTools: 28 built-in tools are added and the MCP tools are reached through ToolSearch.
//   noAllowed: the call is denied ("Permission to use mc…"). Same as the stdio server.
// - draw (real app): haiku added the rectangle and read it back; a direct get_scene confirms it.
// - image: the CLI gets [{type:"image",source:{type:"base64",media_type:"image/png",data}},
//   {type:"text"}]; haiku named the shape, colour and word. 1560x1560 px (96 kB PNG) also worked.
// - cancel: interrupt() resolves in ~20 ms and aborts the handler's extra.signal, but the handler
//   keeps running; without the signal check in bridge.call it still drew on the canvas ~3 s after
//   the query ended. With the check nothing reaches the app. No claude child is left afterwards.
// - restart: the same bridge object reconnects by itself after the app is quit and started again.
// - bun build --compile: the mcp and share modes work from the compiled binary (after an ad-hoc
//   codesign; unsigned it is killed at start, exit 137).
import {
  AbortError,
  createSdkMcpServer,
  query,
  tool,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Socket } from "bun";
import { z } from "zod";

const HOME = Bun.env.INVIC_HOME;
if (!HOME) {
  throw new Error("set INVIC_HOME to the folder that holds the app's bridge.sock");
}
const SOCKET_PATH = `${HOME}/bridge.sock`;
const CLAUDE_PATH = Bun.env.CLAUDE_PATH ?? `${Bun.env.HOME}/.local/bin/claude`;
const ALLOWED = ["get_scene", "add_elements", "render_image"].map((name) => `mcp__canvas__${name}`);
const BLOCKED = ["mcp__canvas__zoom_to_fit"];
const ELEMENT_TYPES = ["rectangle", "ellipse", "diamond", "text", "arrow", "line", "frame"] as const;

type Bridge = ReturnType<typeof openBridge>;

type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

// Test hook for the cancel mode: how long add_elements waits before it calls the app
let addElementsDelayMs = 0;

/**
 * One connection to the app, opened on the first call and reopened after the app closes it.
 * Requests carry an id and replies are matched by id, so concurrent calls can share it.
 * ponytail: no per-call timeout (the Swift client gives up after 180 s); add one if the app can hang.
 */
function openBridge(socketPath: string) {
  const pending = new Map<number, Pending>();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let nextId = 1;
  let connecting: Promise<Socket> | undefined;
  let inbox = "";
  let outbox = new Uint8Array(0);
  const stats = {
    partialWrites: 0,
    connects: 0,
  };

  function connect(): Promise<Socket> {
    connecting ??= Bun.connect({
      unix: socketPath,
      socket: {
        data(_socket, chunk) {
          // stream: true keeps a UTF-8 character that is split across chunks for the next chunk
          inbox += decoder.decode(chunk, { stream: true });
          let newline = inbox.indexOf("\n");
          while (newline >= 0) {
            settle(inbox.slice(0, newline));
            inbox = inbox.slice(newline + 1);
            newline = inbox.indexOf("\n");
          }
        },
        // Bun does not buffer writes like Node does: write() returns how much the kernel took
        drain(socket) {
          flush(socket);
        },
        close() {
          connecting = undefined;
          inbox = "";
          outbox = new Uint8Array(0);
          for (const request of pending.values()) {
            request.reject(new Error("the Invic app closed the connection"));
          }
          pending.clear();
        },
      },
    }).then(
      (socket) => {
        stats.connects += 1;
        return socket;
      },
      (error: { code?: string }) => {
        connecting = undefined;
        const notRunning = error.code === "ENOENT" || error.code === "ECONNREFUSED";
        if (notRunning) {
          throw new Error(`The Invic app is not running (no socket at ${socketPath}).`);
        }
        throw error;
      },
    );
    return connecting;
  }

  function settle(line: string) {
    if (!line.trim()) {
      return;
    }

    const reply = JSON.parse(line) as { id: number; ok: boolean; result?: unknown; error?: string };
    const request = pending.get(reply.id);
    if (!request) {
      return;
    }

    pending.delete(reply.id);
    if (reply.ok) {
      request.resolve(reply.result ?? null);
    } else {
      request.reject(new Error(reply.error ?? "unknown error from the Invic app"));
    }
  }

  function flush(socket: Socket) {
    while (outbox.length > 0) {
      const written = socket.write(outbox);
      if (written <= 0) {
        return;
      }
      outbox = outbox.subarray(written);
      if (outbox.length > 0) {
        stats.partialWrites += 1;
        return; // the rest goes out in drain()
      }
    }
  }

  /** `signal`: the tool call's own (extra.signal); once it is aborted nothing more is sent. */
  async function call(method: string, params: object = {}, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) {
      throw new Error(`cancelled before ${method} reached the app`);
    }
    const socket = await connect();
    const id = nextId;
    nextId += 1;
    const reply = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));

    const line = encoder.encode(JSON.stringify({ id, method, params }) + "\n");
    const queued = new Uint8Array(outbox.length + line.length);
    queued.set(outbox);
    queued.set(line, outbox.length);
    outbox = queued;
    flush(socket);
    return reply;
  }

  async function close() {
    if (connecting) {
      (await connecting).end();
    }
  }

  return { call, close, stats };
}

/** The canvas tools. One instance per query: an MCP server instance takes only one connection. */
function canvasServer(bridge: Bridge) {
  return createSdkMcpServer({
    name: "canvas",
    version: "0.1.0",
    instructions: "Draws in the Invic app, in the file the user has open. The user saves with ⌘S.",
    tools: [
      tool(
        "get_scene",
        "Describe what is on the canvas: every element's id, type, position, size, text, bounds and selection.",
        { include_elements: z.boolean().optional() },
        (args, extra) => textResult(bridge.call("get_scene", args, signalOf(extra))),
        { annotations: { readOnlyHint: true, openWorldHint: false } },
      ),
      tool(
        "add_elements",
        "Add elements to the canvas. Each element: type, optional id, x, y, width, height, label {text}, " +
          'text (text elements), and style fields such as backgroundColor ("#a5d8ff") and fillStyle ("solid").',
        {
          // looseObject: style fields are not listed, the app validates them (like the Swift schema)
          elements: z.array(z.looseObject({ type: z.enum(ELEMENT_TYPES) })).min(1),
          zoom_to_fit: z.boolean().optional(),
        },
        async (args, extra) => {
          const signal = signalOf(extra);
          if (addElementsDelayMs > 0) {
            log(`add_elements handler started, waiting ${addElementsDelayMs} ms (signal: ${signal ? "yes" : "no"})`);
            signal?.addEventListener("abort", () => log("add_elements handler: signal aborted"));
            await Bun.sleep(addElementsDelayMs);
            log(`add_elements handler: now calling the app (signal.aborted=${signal?.aborted})`);
          }
          return textResult(bridge.call("add_elements", args, signal));
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "render_image",
        "Render the drawing (or only some elements) as a PNG and return it to you, to check what you drew.",
        {
          element_ids: z.array(z.string()).optional(),
          scale: z.number().optional(),
        },
        async (args, extra) => {
          try {
            const params = { ...args, scale: args.scale ?? 1, format: "png" };
            const image = (await bridge.call("export_image", params, signalOf(extra))) as {
              base64?: string;
              width?: number;
              height?: number;
            };
            if (!image.base64) {
              throw new Error("the app returned no image data");
            }
            return {
              content: [
                { type: "image", data: image.base64, mimeType: "image/png" },
                { type: "text", text: `PNG ${image.width}x${image.height} px` },
              ],
            };
          } catch (error) {
            return errorResult(error);
          }
        },
        { annotations: { readOnlyHint: true, openWorldHint: false } },
      ),
      tool(
        "zoom_to_fit",
        "Scroll and zoom the user's view so all content (or the given elements) is visible.",
        { element_ids: z.array(z.string()).optional() },
        (args, extra) => textResult(bridge.call("zoom_to_fit", args, signalOf(extra))),
      ),
    ],
  });
}

// The SDK types `extra` as unknown; it is the MCP RequestHandlerExtra, whose signal fires on interrupt()
function signalOf(extra: unknown): AbortSignal | undefined {
  return (extra as { signal?: AbortSignal }).signal;
}

// Tool failures go back to the model in-band (isError), as the Swift server does
async function textResult(call: Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await call) }] };
  } catch (error) {
    return errorResult(error);
  }
}

function errorResult(error: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${(error as Error).message}` }], isError: true };
}

const t0 = performance.now();

function log(message: string) {
  console.log(`${String(Math.round(performance.now() - t0)).padStart(6)}ms ${message}`);
}

/** JSON with long strings (base64) cut short, for logging. */
function short(value: unknown, max = 300): string {
  const text = JSON.stringify(value, (_key, v) =>
    typeof v === "string" && v.length > 80 ? `${v.slice(0, 20)}…(${v.length} chars)` : v,
  );
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// The options the handoff settled on, with the in-process server in place of the stdio one
function restrictedOptions(bridge: Bridge): Options {
  return {
    pathToClaudeCodeExecutable: CLAUDE_PATH,
    settingSources: [],
    persistSession: false,
    cwd: process.cwd(), // not import.meta.dir: in a bun --compile binary that is /$bunfs/root
    model: "haiku",
    mcpServers: { canvas: canvasServer(bridge) },
    mcpServersDelivery: "initialize",
    tools: [],
    allowedTools: ALLOWED,
    disallowedTools: BLOCKED,
    permissionMode: "dontAsk",
  };
}

/** A streaming prompt (needed for images and interrupt): one message, then the input ends. */
async function* oneMessage(text: string): AsyncGenerator<SDKUserMessage> {
  yield { type: "user", parent_tool_use_id: null, message: { role: "user", content: text } };
}

/** A streaming prompt that never sends anything: the CLI starts and connects MCP, no model turn. */
async function* noMessage(): AsyncGenerator<SDKUserMessage> {
  await new Promise(() => {});
}

type RunHooks = {
  onToolUse?: (q: ReturnType<typeof query>, abort: AbortController) => Promise<void>;
};

async function run(label: string, options: Options, text: string, hooks: RunHooks = {}) {
  const abort = new AbortController();
  const q = query({ prompt: oneMessage(text), options: { ...options, abortController: abort } });
  try {
    for await (const m of q) {
      if (m.type === "system" && m.subtype === "init") {
        log(`[${label}] init model=${m.model} tools=${JSON.stringify(m.tools)}`);
        log(`[${label}] init mcp_servers=${JSON.stringify(m.mcp_servers)}`);
        continue;
      }
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "tool_use") {
            log(`[${label}] tool_use ${block.name} ${short(block.input, 160)}`);
            await hooks.onToolUse?.(q, abort);
          } else if (block.type === "text") {
            log(`[${label}] text: ${block.text.slice(0, 300)}`);
          }
        }
        continue;
      }
      if (m.type === "user" && Array.isArray(m.message.content)) {
        for (const block of m.message.content) {
          if (block.type === "tool_result") {
            log(`[${label}] tool_result is_error=${block.is_error} ${short(block.content, 600)}`);
          }
        }
        continue;
      }
      if (m.type === "result") {
        log(
          `[${label}] result subtype=${m.subtype} is_error=${m.is_error} turns=${m.num_turns} ` +
            `terminal_reason=${(m as { terminal_reason?: string }).terminal_reason} cost=${m.total_cost_usd} 
            models=${JSON.stringify(Object.keys(m.modelUsage))}`,
        );
      }
    }
    log(`[${label}] iterator finished`);
  } catch (error) {
    const isAbort = error instanceof AbortError;
    log(`[${label}] THROWN (AbortError: ${isAbort}) ${(error as Error).message}`);
  }
}

/** Polls mcpServerStatus() before any user message is read (no model turn), like sdk-options.ts premsg. */
async function statusBeforeMessage(label: string, q: ReturnType<typeof query>) {
  await q.initializationResult();
  let status = await q.mcpServerStatus();
  while (status.some((s) => s.status === "pending") && performance.now() - t0 < 15000) {
    await Bun.sleep(100);
    status = await q.mcpServerStatus();
  }
  const summary = status.map((s) => ({
    name: s.name,
    status: s.status,
    error: s.error,
    tools: s.tools?.map((x) => x.name),
  }));
  log(`[${label}] mcpServerStatus=${JSON.stringify(summary)}`);
}

function children(): string {
  return Bun.spawnSync(["pgrep", "-lP", String(process.pid)]).stdout.toString().trim();
}

const bridge = openBridge(SOCKET_PATH);
// Element ids stay taken after a delete, so every run uses fresh ones
const RUN = Date.now().toString(36);
const [mode, arg] = Bun.argv.slice(2);

switch (mode) {
  case "socket": {
    log(`ping -> ${short(await bridge.call("ping"))}`);
    log(`get_scene -> ${short(await bridge.call("get_scene", { include_elements: false }))}`);
    log(`unknown method -> ${await bridge.call("no_such_method").catch((e: Error) => e.message)}`);

    // Five calls at once on one connection: each reply must reach its own caller
    const many = (await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        bridge.call("add_elements", {
          elements: [{ type: "text", id: `n${n}-${RUN}`, x: 0, y: n * 40, text: `n${n}` }],
        }),
      ),
    )) as { created: { id: string }[] }[];
    log(`5 concurrent add_elements -> ids ${many.map((r) => r.created[0]!.id).join(",")}`);

    // A long line with Chinese text: partial writes and UTF-8 split across chunks
    const longText = "中文測試，一二三四五。\n".repeat(8000);
    await bridge.call("add_elements", {
      elements: [{ type: "text", id: `long-${RUN}`, x: 0, y: 400, text: longText }],
      zoom_to_fit: false,
    });
    const scene = (await bridge.call("get_scene")) as { elements: { id: string; text?: string }[] };
    const back = scene.elements.find((e) => e.id === `long-${RUN}`)?.text;
    const bytes = new TextEncoder().encode(longText).length;
    log(`long text: sent ${longText.length} chars (${bytes} bytes), read back equal=${back === longText}`);
    log(`  read back ${back?.length} chars, ending ${JSON.stringify(back?.slice(-40))}`);
    log(`stats ${JSON.stringify(bridge.stats)}`);
    await bridge.call("delete_elements", { ids: [2, 3, 4, 5].map((n) => `n${n}-${RUN}`).concat(`long-${RUN}`) });

    const image = (await bridge.call("export_image", { format: "png", scale: 1 })) as { base64: string };
    log(`export_image base64 ${image.base64.length} chars`);
    await bridge.call("delete_elements", { ids: [`n1-${RUN}`] });
    const missing = openBridge("/tmp/no-such-dir/bridge.sock");
    log(`missing socket -> ${await missing.call("ping").catch((e: Error) => e.message)}`);
    break;
  }

  case "mcp": {
    // The in-process server's tools through a real MCP client (no CLI, no model)
    const server = canvasServer(bridge);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.instance.connect(serverSide);
    const client = new Client({ name: "exp", version: "1" });
    await client.connect(clientSide);
    log(`instructions=${JSON.stringify(client.getInstructions())}`);
    const { tools } = await client.listTools();
    for (const t of tools) {
      log(`tool ${t.name} inputSchema=${JSON.stringify(t.inputSchema)}`);
    }

    const added = await client.callTool({
      name: "add_elements",
      arguments: {
        elements: [
          {
            type: "rectangle",
            id: `blue-${RUN}`,
            x: 0,
            y: 0,
            width: 160,
            height: 80,
            backgroundColor: "#a5d8ff",
            fillStyle: "solid",
            label: { text: "Blue" },
          },
        ],
      },
    });
    log(`add_elements -> ${short(added)}`);
    const scene = (await bridge.call("get_scene")) as { elements: { id: string }[] };
    log(`blue as the app has it: ${short(scene.elements.find((e) => e.id === `blue-${RUN}`))}`);
    const badType = await client.callTool({ name: "add_elements", arguments: { elements: [{ type: "star" }] } });
    log(`bad type -> ${short(badType)}`);
    const appError = await client.callTool({ name: "render_image", arguments: { element_ids: ["missing"] } });
    log(`app error -> ${short(appError)}`);

    const image = (await client.callTool({ name: "render_image", arguments: {} })) as CallToolResult;
    const png = image.content.find((c) => c.type === "image");
    log(`render_image -> ${short(image)}`);
    if (png?.type === "image") {
      const bytes = Buffer.from(png.data, "base64");
      const size = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
      log(`PNG ${bytes.length} bytes, magic=${bytes.subarray(1, 4).toString()}, ${size}`);
    }
    await bridge.call("delete_elements", { ids: [`blue-${RUN}`] });
    await client.close();
    break;
  }

  case "share": {
    // One server instance given to two queries: at once, then one after the other (no model turn)
    const shared = { ...restrictedOptions(bridge) };
    const first = query({ prompt: noMessage(), options: shared });
    const second = query({ prompt: noMessage(), options: shared });
    await statusBeforeMessage("first", first);
    await statusBeforeMessage("second (same instance, at once)", second);
    first.close();
    second.close();
    await Bun.sleep(500);
    const third = query({ prompt: noMessage(), options: shared });
    await statusBeforeMessage("third (same instance, after close)", third);
    third.close();
    log(`after close(): children=${JSON.stringify(children())}`);
    while (children() && performance.now() - t0 < 20000) {
      await Bun.sleep(50);
    }
    log(`children gone: ${children() === ""}`);
    break;
  }

  case "list": {
    // Tool restriction configs from the handoff, with the in-process server
    const full = restrictedOptions(bridge);
    const configs: Record<string, Options> = {
      full,
      noTools: { ...full, tools: undefined },
      noAllowed: { ...full, allowedTools: undefined },
    };
    const options = configs[arg ?? "full"];
    if (!options) {
      throw new Error(`unknown config ${arg}; one of ${Object.keys(configs).join(", ")}`);
    }
    const prompt = "Call get_scene once with include_elements false, then reply with one word.";
    await run(arg ?? "full", { ...options, maxTurns: 2 }, prompt);
    break;
  }

  case "draw": {
    const before = (await bridge.call("get_scene", { include_elements: false })) as {
      file: string;
      elementCount: number;
    };
    log(`before: file=${before.file} elementCount=${before.elementCount}`);
    await run(
      "draw",
      { ...restrictedOptions(bridge), maxTurns: 4 },
      'Add one rectangle with id "bun", x 0, y 0, width 200, height 80, label "Hello from Bun", ' +
        'backgroundColor "#b2f2bb", fillStyle "solid". Then call get_scene and reply with the number of elements.',
    );
    const after = (await bridge.call("get_scene")) as {
      elements: { id: string; type: string; label?: string; backgroundColor?: string }[];
    };
    const shapes = after.elements.map((e) => ({ id: e.id, type: e.type, label: e.label, bg: e.backgroundColor }));
    log(`after, read directly: ${short(shapes, 800)}`);
    break;
  }

  case "image": {
    await bridge.call("add_elements", {
      elements: [
        {
          type: "ellipse",
          id: `moon-${RUN}`,
          x: 0,
          y: 0,
          width: 220,
          height: 220,
          backgroundColor: "#ffc9c9",
          fillStyle: "solid",
          label: { text: "MOON" },
        },
      ],
    });
    await run(
      "image",
      { ...restrictedOptions(bridge), maxTurns: 3 },
      `Call render_image once${arg === "big" ? " with scale 6" : ""} (no get_scene). ` +
        "Then reply in a few words: which shape, which fill colour and which word you see.",
    );
    await bridge.call("delete_elements", { ids: [`moon-${RUN}`] });
    break;
  }

  case "cancel": {
    // add_elements waits before it reaches the app; cancel while it waits
    addElementsDelayMs = 3000;
    await run(
      "cancel",
      { ...restrictedOptions(bridge), maxTurns: 3 },
      `Call add_elements once with [{"type":"text","id":"late-${RUN}","x":0,"y":-200,"text":"late"}], then say done.`,
      {
        onToolUse: async (q, abort) => {
          await Bun.sleep(300); // let the CLI start the call
          log("calling interrupt()");
          log(`interrupt() resolved ${JSON.stringify(await q.interrupt())}`);
          log("calling abort()");
          abort.abort();
        },
      },
    );
    log(`children right after: ${JSON.stringify(children())}`);
    await Bun.sleep(4000);
    const scene = (await bridge.call("get_scene")) as { elements: { id: string }[] };
    const late = scene.elements.some((e) => e.id === `late-${RUN}`);
    log(`4 s later: "late" on the canvas=${late}, children=${JSON.stringify(children())}`);
    await bridge.call("delete_elements", { ids: [`late-${RUN}`] }).catch(() => {});
    break;
  }

  case "concurrent": {
    // Two queries at once, each with its own server instance, sharing one bridge connection
    const prompt = (n: number) =>
      "Call add_elements once with " +
      `[{"type":"text","id":"q${n}-${RUN}","x":${n * 200},"y":-300,"text":"query ${n}"}], ` +
      "then call get_scene with include_elements false and reply with elementCount.";
    await Promise.all([1, 2].map((n) => run(`q${n}`, { ...restrictedOptions(bridge), maxTurns: 4 }, prompt(n))));
    const scene = (await bridge.call("get_scene")) as { elements: { id: string }[] };
    const ours = scene.elements.filter((e) => e.id === `q1-${RUN}` || e.id === `q2-${RUN}`);
    log(`both on the canvas: ${ours.map((e) => e.id)}; connects=${bridge.stats.connects}`);
    await bridge.call("delete_elements", { ids: [`q1-${RUN}`, `q2-${RUN}`] }).catch(() => {});
    break;
  }

  case "restart": {
    // One long-lived bridge while the app is quit and started again from outside
    for (let i = 0; i < Number(arg ?? 20); i++) {
      const answer = await bridge.call("ping").then(short, (e: Error) => `error: ${e.message}`);
      log(`ping -> ${answer} (connects=${bridge.stats.connects})`);
      await Bun.sleep(1000);
    }
    break;
  }

  default:
    throw new Error(`unknown mode ${mode}`);
}

await bridge.close();
log(`done, children=${JSON.stringify(children())}`);
