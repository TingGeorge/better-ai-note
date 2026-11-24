import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

import { transcribe } from "../../src/transcribe/index.ts";

const STT_ENV = {
  STT_BASE_URL: "https://stt.example.com/v1/",
  STT_API_KEY: "stt-key",
  STT_MODEL: "whisper-1",
};

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
  Object.assign(Bun.env, STT_ENV);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ text: "  畫一個長條圖  " }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const key of Object.keys(STT_ENV)) {
    delete Bun.env[key];
  }
});

test("returns_text_from_stt_api", async () => {
  const response = await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "畫一個長條圖" });
});

test("sends_audio_and_model_to_openai_compatible_endpoint", async () => {
  await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  // The trailing slash in STT_BASE_URL must not turn into "//audio"
  expect(url).toBe("https://stt.example.com/v1/audio/transcriptions");
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer stt-key");
  const body = init.body as FormData;
  expect(body.get("model")).toBe("whisper-1");
  expect((body.get("file") as File).name).toBe("voice.m4a");
});

test("answers_503_when_stt_is_not_configured", async () => {
  delete Bun.env.STT_API_KEY;

  const response = await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(503);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers_400_without_audio_field", async () => {
  const form = new FormData();
  form.append("note", "no audio here");

  const response = await transcribe(new Request("http://localhost/transcribe", { method: "POST", body: form }));

  expect(response.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers_400_for_non_multipart_body", async () => {
  const request = new Request("http://localhost/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  const response = await transcribe(request);

  expect(response.status).toBe(400);
});

test("answers_400_for_empty_audio", async () => {
  const response = await transcribe(audioRequest(new File([], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(400);
});

test("answers_415_for_non_audio_file", async () => {
  const response = await transcribe(audioRequest(new File(["hello"], "notes.txt", { type: "text/plain" })));

  expect(response.status).toBe(415);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers_413_for_audio_over_25_mb", async () => {
  const tooBig = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "long.m4a", { type: "audio/mp4" });

  const response = await transcribe(audioRequest(tooBig));

  expect(response.status).toBe(413);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers_502_when_stt_api_fails", async () => {
  fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));

  const response = await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(502);
  const body = (await response.json()) as { error: string };
  expect(body.error).toContain("429");
});

test("answers_502_when_stt_api_is_unreachable", async () => {
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

  const response = await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(502);
});

test("answers_502_when_stt_answer_has_no_text", async () => {
  fetchSpy.mockResolvedValue(Response.json({ something: "else" }));

  const response = await transcribe(audioRequest(new File(["fake audio"], "voice.m4a", { type: "audio/mp4" })));

  expect(response.status).toBe(502);
});

function audioRequest(audio: File): Request {
  const form = new FormData();
  form.append("audio", audio);
  return new Request("http://localhost/transcribe", { method: "POST", body: form });
}
