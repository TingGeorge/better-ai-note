// TODO: run the agent (pi-agent-core) on the circled image and stream the result over SSE.
// Design: docs/backend-architecture.html
export function generate(): Response {
  return Response.json({ error: "POST /generate is not implemented yet" }, { status: 501 });
}

// TODO: same path as generate, with the previous result and the user's comment added.
export function revise(): Response {
  return Response.json({ error: "POST /revise is not implemented yet" }, { status: 501 });
}
