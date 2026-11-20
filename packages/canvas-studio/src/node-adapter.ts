import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { serveApplicationEventStream, type NodeApplicationProductAdapter } from "@hypit/application/node";
import { CanvasError, type CanvasTransaction } from "@hypit/canvas";
import { CanvasStudioProductSession, canvasStudioProduct } from "./host.js";

async function json(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    throw new CanvasError("invalid-content-type", "Canvas requests require application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new CanvasError("request-too-large", "Canvas request exceeds one megabyte.");
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new CanvasError("invalid-json", "Canvas request must be JSON."); }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body) + "\n");
}

async function sendStatic(response: ServerResponse, pathname: string): Promise<boolean> {
  const file = pathname === "/" ? "index.html" : /^\/assets\/[\w.-]+\.(?:js|css|woff2)$/u.test(pathname) ? pathname.slice(1) : undefined;
  if (file === undefined) return false;
  const path = new URL("./browser/" + file, import.meta.url);
  const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (info === undefined) return false;
  const mediaType = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8"
    : file.endsWith(".woff2") ? "font/woff2" : "text/javascript; charset=utf-8";
  response.writeHead(200, {
    "content-type": mediaType,
    "content-length": info.size,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  });
  await pipeline(createReadStream(path), response);
  return true;
}

type Range = { readonly start: number; readonly end: number };

function range(value: string, size: number): Range | undefined {
  const parsed = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (parsed === null || size <= 0) return undefined;
  const first = parsed[1]!;
  const last = parsed[2]!;
  if (first === "") {
    const suffix = Number(last);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : undefined;
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : undefined;
}

async function* slice(bytes: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, selected: Range) {
  let offset = 0;
  for await (const chunk of bytes) {
    const start = Math.max(0, selected.start - offset);
    offset += chunk.length;
    if (start >= chunk.length) continue;
    const end = chunk.length - Math.max(0, offset - selected.end - 1);
    if (end > start) yield chunk.subarray(start, end);
    if (offset > selected.end) return;
  }
}

async function sendPreview(request: IncomingMessage, response: ServerResponse, studio: CanvasStudioProductSession, token: string) {
  const source = await studio.openPreview(token);
  if (!/^(image|audio|video)\/[a-z0-9.+-]+$/iu.test(source.mediaType)) throw new CanvasError("invalid-preview", "Resource is not playable media.");
  const size = source.size;
  const requested = request.headers.range;
  const selected = size === undefined || requested === undefined ? undefined : range(requested, size);
  if (size !== undefined && requested !== undefined && selected === undefined) {
    response.writeHead(416, { "content-range": "bytes */" + size, "cache-control": "no-store" });
    response.end();
    return;
  }
  response.writeHead(selected === undefined ? 200 : 206, {
    "content-type": source.mediaType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
    ...(size === undefined ? {} : { "accept-ranges": "bytes", "content-length": size }),
    ...(selected === undefined ? {} : {
      "content-range": `bytes ${selected.start}-${selected.end}/${size}`,
      "content-length": selected.end - selected.start + 1,
    }),
  });
  if (request.method === "HEAD") response.end();
  else await pipeline(selected === undefined ? source.bytes : slice(source.bytes, selected), response);
}

async function receiveMedia(session: CanvasStudioProductSession, request: IncomingMessage, name: string, signal: AbortSignal) {
  if (!name.trim()) throw new CanvasError("missing-filename", "Media import requires a filename.");
  const directory = await mkdtemp(join(tmpdir(), "hypit-canvas-media-"));
  const sourcePath = join(directory, "upload");
  try {
    await pipeline(request, createWriteStream(sourcePath, { flags: "wx" }), { signal });
    if (!(await stat(sourcePath)).size) throw new CanvasError("empty-media", "The uploaded Media file is empty.");
    return await session.importMedia({ sourcePath, sourceName: name }, signal);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const canvasStudioNodeProductAdapter: NodeApplicationProductAdapter = {
  product: canvasStudioProduct,
  async handle({ request, response, session, pathname, url, signal }) {
    if (!(session instanceof CanvasStudioProductSession)) throw new Error("Canvas adapter requires a Canvas Product Session.");
    try {
      if (request.method === "GET" && pathname === "/api/events") {
        serveApplicationEventStream(response, AbortSignal.any([signal, session.closed]), listener => session.subscribe(listener));
        return true;
      }
      if ((request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/api/resources/")) {
        await sendPreview(request, response, session, pathname.slice("/api/resources/".length));
        return true;
      }
      if (request.method !== "POST") return request.method === "GET" && await sendStatic(response, pathname);
      const canvas = session.canvas;
      switch (pathname) {
        case "/api/observe": send(response, 200, await canvas.observe(await json(request))); break;
        case "/api/command": send(response, 200, await canvas.transact(await json(request) as CanvasTransaction)); break;
        case "/api/quote": send(response, 200, await canvas.quote(await json(request), signal)); break;
        case "/api/invocations": send(response, 202, await canvas.invoke(await json(request), signal)); break;
        case "/api/invocations/cancel": send(response, 200, await canvas.cancel(await json(request))); break;
        case "/api/adoptions": send(response, 201, await canvas.adopt(await json(request), signal)); break;
        case "/api/media/import": send(response, 201, await receiveMedia(session, request, url.searchParams.get("name") ?? "", signal)); break;
        case "/api/resources": send(response, 200, await session.createPreview(await json(request))); break;
        default: return false;
      }
      return true;
    } catch (error) {
      if (response.headersSent) response.destroy();
      else {
        const code = error instanceof CanvasError ? error.code : undefined;
        send(response, code === "revision-conflict" || code === "destination-exists" || code === "invocation-conflict" ? 409 : 400,
          { error: error instanceof Error ? error.message : String(error), code, subject: error instanceof CanvasError ? error.subject : undefined });
      }
      return true;
    }
  },
};
