// Reads the uploaded audio out of a POST /transcribe request and checks it before it costs an STT call.

// OpenAI's transcription endpoint refuses files over 25 MB; a spoken request of a few seconds is far below this
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioResult = { ok: true; audio: File } | { ok: false; status: number; error: string };

export async function readAudio(request: Request): Promise<AudioResult> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return { ok: false, status: 400, error: "Send the audio as multipart/form-data with an `audio` field" };
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return { ok: false, status: 400, error: "Could not read the multipart body" };
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return { ok: false, status: 400, error: "Missing `audio` file field" };
  }
  if (audio.size === 0) {
    return { ok: false, status: 400, error: "The audio file is empty" };
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return { ok: false, status: 413, error: "The audio file is larger than 25 MB" };
  }
  if (!audio.type.startsWith("audio/")) {
    return { ok: false, status: 415, error: `Expected an audio/* file, got "${audio.type || "no type"}"` };
  }

  return { ok: true, audio };
}
