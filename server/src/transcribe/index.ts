// TODO: send the uploaded audio to the STT API and return `{ text }`.
// Design: docs/architecture.html
export function transcribe(): Response {
  return Response.json({ error: "POST /transcribe is not implemented yet" }, { status: 501 });
}
