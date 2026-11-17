import type { ServerResponse } from "node:http";

/** Bridge live invalidations to HTTP. A slow client reconnects and observes current state. */
export function serveApplicationEventStream<Event>(
  response: ServerResponse,
  signal: AbortSignal,
  subscribe: (listener: (event: Event) => void) => () => void,
): void {
  signal.throwIfAborted();
  const unsubscribe = subscribe((event) => {
    if (!response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`)) {
      response.destroy();
    }
  });
  const close = () => response.end();
  response.once("close", () => {
    unsubscribe();
    signal.removeEventListener("abort", close);
  });
  signal.addEventListener("abort", close, { once: true });
  response.writeHead(200, {
    "cache-control": "no-cache, no-store",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
    "x-content-type-options": "nosniff",
  });
  response.write("event: ready\ndata: {}\n\n");
}
