// Calls the external speech-to-text API. It speaks the OpenAI-compatible format, so the owner can point
// STT_BASE_URL at OpenAI, Groq, or a self-hosted Whisper without code changes.

export type SttConfig = { baseUrl: string; apiKey: string; model: string };

export class SttError extends Error {}

// Read on each call rather than at load time, so the server still starts (and the other routes work)
// when the owner has not set up voice input
export function readSttConfig(env: Record<string, string | undefined> = Bun.env): SttConfig | null {
  const baseUrl = env.STT_BASE_URL;
  const apiKey = env.STT_API_KEY;
  const model = env.STT_MODEL;
  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

export async function requestTranscription(audio: File, config: SttConfig): Promise<string> {
  const body = new FormData();
  body.append("file", audio, audio.name || "audio");
  body.append("model", config.model);
  body.append("response_format", "json");

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body,
    });
  } catch (error) {
    throw new SttError(`Could not reach the STT API: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new SttError(`The STT API answered ${response.status}`);
  }

  const result = (await response.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof result?.text !== "string") {
    throw new SttError("The STT API answer has no `text`");
  }

  return result.text.trim();
}
