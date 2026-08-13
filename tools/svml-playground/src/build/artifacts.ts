import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

/** Content-addressed layout: `<root>/sha256/<first two hex>/<full hex>`. */
export function artifactPath(root: string, digest: string): string | undefined {
  const [algorithm, hex] = digest.split(":");
  if (algorithm !== "sha256" || hex === undefined || !/^[0-9a-f]{64}$/u.test(hex)) return undefined;
  return join(root, algorithm, hex.slice(0, 2), hex);
}

function requestedRange(header: string | undefined, size: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header ?? "");
  if (match === null) return undefined;
  const [, from, to] = match;
  if (from === "" && to === "") return undefined;
  // A suffix range asks for the last N bytes.
  const start = from === "" ? Math.max(0, size - Number(to)) : Number(from);
  const end = from === "" || to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return undefined;
  return { start, end };
}

/**
 * Stream a file, honouring Range.
 *
 * Range is not an optimization here: a browser will not seek an `mp4` served
 * without it, so scrubbing a real render would silently do nothing. The stream
 * is destroyed rather than ended on error, because a truncated body that
 * arrived with a 200 reads as a valid short video.
 */
export async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  mediaType: string,
): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile()) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const range = requestedRange(request.headers.range, info.size);
  response.setHeader("content-type", mediaType);
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("cache-control", "no-store");

  if (range === undefined) {
    response.statusCode = 200;
    response.setHeader("content-length", String(info.size));
  } else {
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${range.start}-${range.end}/${info.size}`);
    response.setHeader("content-length", String(range.end - range.start + 1));
  }
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(path, range === undefined ? {} : { start: range.start, end: range.end });
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}
