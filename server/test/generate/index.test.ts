import { beforeEach, expect, test } from "bun:test";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";

import { createGenerate } from "../../src/generate/index.ts";

// A scripted model: each test queues the replies it should give, and no network is used
const faux = fauxProvider({ models: [{ id: "faux-vision", input: ["text", "image"] }] });
const models = createModels();
models.setProvider(faux.provider);
const model = faux.getModel() as Model<Api>;

const generate = createGenerate({
  getModelSetup: () => ({ models, model }),
  loadSystemPrompt: async () => "test system prompt",
});

// A 1x1 PNG
const IMAGE = {
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  mimeType: "image/png",
};

const TABLE = { kind: "table", data: { columns: ["x"], rows: [[1], [2]] } };

// callCount keeps counting across tests, so each test measures from its own start
let callsBefore = 0;
beforeEach(() => {
  faux.setResponses([]);
  callsBefore = faux.state.callCount;
});
const modelCalls = () => faux.state.callCount - callsBefore;

function post(body: unknown): Request {
  return new Request("http://localhost/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type SseEvent = { event: string; data: any };

async function readEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const event = chunk.match(/^event: (.*)$/m)?.[1] ?? "";
      const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? "null");
      return { event, data };
    });
}

test("streams_preview_then_done_with_block", async () => {
  faux.setResponses([
    fauxAssistantMessage([fauxText("整理成表格"), fauxToolCall("check_block", TABLE)], { stopReason: "toolUse" }),
  ]);

  const response = await generate(post({ image: IMAGE, request: "make a table" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/event-stream");

  const events = await readEvents(response);
  const preview = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
  expect(preview).toBe("整理成表格");
  expect(events.at(-1)).toEqual({ event: "done", data: { block: TABLE } });
  // The accepted block ends the run: no second model call
  expect(modelCalls()).toBe(1);
});

test("sends_image_and_request_to_the_model", async () => {
  let seen: unknown;
  faux.setResponses([
    (context) => {
      seen = context.messages.find((m) => m.role === "user");
      return fauxAssistantMessage([fauxToolCall("check_block", TABLE)], { stopReason: "toolUse" });
    },
  ]);

  await readEvents(await generate(post({ image: IMAGE, request: "make a table" })));

  const content = (seen as { content: { type: string; text?: string; data?: string }[] }).content;
  expect(content).toContainEqual({ type: "text", text: "The person's request: make a table" });
  expect(content).toContainEqual(expect.objectContaining({ type: "image", data: IMAGE.data }));
});

test("model_fixes_a_rejected_block_and_retries", async () => {
  let rejection = "";
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("check_block", { kind: "table", data: { columns: ["a", "b"], rows: [[1]] } })], {
      stopReason: "toolUse",
    }),
    (context) => {
      const result = context.messages.findLast((m) => m.role === "toolResult");
      rejection = JSON.stringify(result);
      return fauxAssistantMessage([fauxToolCall("check_block", TABLE)], { stopReason: "toolUse" });
    },
  ]);

  const events = await readEvents(await generate(post({ image: IMAGE })));

  expect(rejection).toContain("has 1 cells but there are 2 columns");
  expect(events.at(-1)).toEqual({ event: "done", data: { block: TABLE } });
  expect(modelCalls()).toBe(2);
});

test("gives_up_after_four_rejected_blocks", async () => {
  const bad = fauxAssistantMessage([fauxToolCall("check_block", { kind: "table", data: {} })], { stopReason: "toolUse" });
  faux.setResponses([bad, bad, bad, bad, bad, bad]);

  const events = await readEvents(await generate(post({ image: IMAGE })));

  expect(events.at(-1)).toEqual({ event: "error", data: { error: "The model did not produce a valid block in 4 tries" } });
  expect(modelCalls()).toBe(4);
});

test("reports_error_when_model_answers_without_a_block", async () => {
  faux.setResponses([fauxAssistantMessage([fauxText("Here is your table: ...")])]);

  const events = await readEvents(await generate(post({ image: IMAGE })));

  expect(events.at(-1)).toEqual({ event: "error", data: { error: "The model finished without producing a block" } });
});

test("reports_error_when_model_request_fails", async () => {
  // An empty queue makes the faux provider answer with an error, like a failed API call
  const events = await readEvents(await generate(post({ image: IMAGE })));

  expect(events.at(-1)?.event).toBe("error");
  expect(events.at(-1)?.data.error).toStartWith("Model request failed:");
});

test("rejects_missing_image_with_400", async () => {
  const response = await generate(post({ request: "make a table" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "`image` is required: { data, mimeType }" });
});

test("rejects_unsupported_image_type_with_400", async () => {
  const response = await generate(post({ image: { ...IMAGE, mimeType: "image/tiff" } }));
  expect(response.status).toBe(400);
});

test("rejects_non_base64_image_with_400", async () => {
  const response = await generate(post({ image: { ...IMAGE, data: "not base64!" } }));
  expect(response.status).toBe(400);
});

test("rejects_non_json_body_with_400", async () => {
  const response = await generate(new Request("http://localhost/generate", { method: "POST", body: "hello" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Body must be JSON" });
});

test("rejects_body_over_size_limit_with_400", async () => {
  const response = await generate(
    new Request("http://localhost/generate", {
      method: "POST",
      headers: { "Content-Length": String(11 * 1024 * 1024) },
      body: "{}",
    }),
  );
  expect(response.status).toBe(400);
});
