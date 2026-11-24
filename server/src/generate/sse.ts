export type SendEvent = (event: string, data: unknown) => void;

// Runs `produce` and streams what it sends as Server-Sent Events. The stream closes when
// `produce` returns, or early when the client goes away.
export function sseResponse(signal: AbortSignal, produce: (send: SendEvent) => Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const close = () => {
        if (open) {
          open = false;
          controller.close();
        }
      };
      signal.addEventListener("abort", close);

      const send: SendEvent = (event, data) => {
        if (open) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };

      try {
        await produce(send);
      } finally {
        signal.removeEventListener("abort", close);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
