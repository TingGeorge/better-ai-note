// POST /transcribe: takes a recorded voice request and returns `{ text }` for the app's input box.
// The audio only lives in memory for this request and is never logged or stored.
// Design: docs/backend-architecture.html
import { readAudio } from "./audio.ts";
import { readSttConfig, requestTranscription, SttError } from "./stt.ts";

export async function transcribe(request: Request): Promise<Response> {
  const config = readSttConfig();
  if (!config) {
    return Response.json(
      { error: "Voice input is not set up. Fill in STT_BASE_URL, STT_API_KEY and STT_MODEL in .env" },
      { status: 503 },
    );
  }

  const upload = await readAudio(request);
  if (!upload.ok) {
    return Response.json({ error: upload.error }, { status: upload.status });
  }

  try {
    const text = await requestTranscription(upload.audio, config);
    return Response.json({ text });
  } catch (error) {
    if (error instanceof SttError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
