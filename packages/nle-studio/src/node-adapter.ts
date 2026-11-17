import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { NodeApplicationProductAdapter } from "@hypit/application/node";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { NleStudioProductSession, nleStudioProduct } from "./host.js";
import type {
  NleStudioAdjustMaterializeRequest,
  NleStudioCommandRequest,
  NleStudioComponentMaterializeRequest,
  NleStudioInspectorRequest,
  NleStudioMediaPlaceRequest,
  NleStudioSession,
  NleStudioTransitionMaterializeRequest,
} from "./protocol.js";

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1024 * 1024) throw new Error("NLE Studio request exceeds one megabyte.");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("NLE Studio request body must be JSON.");
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

const browserDirectory = fileURLToPath(new URL("./browser/", import.meta.url));
const staticFiles: Readonly<Record<string, { readonly file: string; readonly type: string }>> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
};

async function sendStatic(response: ServerResponse, pathname: string): Promise<boolean> {
  const selected = staticFiles[pathname] ?? (pathname.startsWith("/assets/")
    ? { file: pathname.slice(1), type: pathname.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" }
    : undefined);
  if (selected === undefined || selected.file.includes("..")) return false;
  const path = resolve(browserDirectory, selected.file);
  const info = await stat(path);
  response.writeHead(200, {
    "content-type": selected.type,
    "content-length": info.size,
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
  return true;
}

type ByteRange = { readonly start: number; readonly end: number };

function byteRange(value: string | undefined, size: number): ByteRange | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (match === null || size === 0) throw new Error("NLE Studio resource Range is invalid.");
  const startText = match[1]!;
  const endText = match[2]!;
  let start: number;
  let end: number;
  if (startText.length === 0) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("NLE Studio resource Range is invalid.");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText.length === 0 ? size - 1 : Number(endText);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || start >= size) {
    throw new Error("NLE Studio resource Range is outside the current file.");
  }
  return { start, end: Math.min(end, size - 1) };
}

async function sendResource(
  studio: NleStudioProductSession,
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
): Promise<void> {
  const resource = studio.resource(token);
  const information = await stat(resource.address);
  if (!information.isFile()) throw new Error("NLE Studio resource is not a file.");
  let range: ByteRange | undefined;
  try {
    range = byteRange(typeof request.headers.range === "string" ? request.headers.range : undefined,
      information.size);
  } catch {
    response.writeHead(416, {
      "content-range": `bytes */${information.size}`,
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    response.end();
    return;
  }
  const status = range === undefined ? 200 : 206;
  const length = range === undefined ? information.size : range.end - range.start + 1;
  response.writeHead(status, {
    "content-type": resource.mediaType,
    "content-length": length,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    ...(range === undefined ? {} : { "content-range": `bytes ${range.start}-${range.end}/${information.size}` }),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(resource.address, range === undefined ? undefined : {
    start: range.start,
    end: range.end,
  });
  stream.on("error", (error) => response.destroy(error));
  stream.pipe(response);
}

async function sendPresentation(
  studio: NleStudioProductSession,
  response: ServerResponse,
  resource: string,
): Promise<void> {
  const value = await studio.presentationResource(resource);
  response.writeHead(200, {
    "content-type": value.mediaType,
    "content-length": value.bytes.byteLength,
    "cache-control": "no-store",
  });
  response.end(value.bytes);
}

async function receiveMediaFile(
  studio: NleStudioProductSession,
  request: IncomingMessage,
  name: string,
): Promise<NleStudioSession> {
  if (name.length === 0) throw new Error("NLE Studio Media import requires a filename.");
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-upload-"));
  const source = join(directory, "source");
  try {
    await pipeline(request, createWriteStream(source, { flags: "wx" }));
    const information = await stat(source);
    if (information.size === 0) throw new Error(`NLE Studio Media import ${name} is empty.`);
    return await studio.importMediaFile({ sourcePath: source, sourceName: name });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const nleStudioNodeProductAdapter: NodeApplicationProductAdapter = {
  product: nleStudioProduct,
  async handle({ request, response, session, pathname, url }) {
    if (!(session instanceof NleStudioProductSession)) {
      throw new Error("NLE Studio adapter received another Product Session kind.");
    }
    const studio = session;
    try {
      if (request.method === "GET" && pathname === "/api/session") {
        sendJson(response, 200, await studio.observe());
        return true;
      }
      if (request.method === "POST" && pathname === "/api/command") {
        const body = await jsonBody(request) as NleStudioCommandRequest;
        sendJson(response, 200, await studio.command(body.command as NleEditingSurfaceCommand));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/place") {
        sendJson(response, 200, await studio.placeMedia(await jsonBody(request) as NleStudioMediaPlaceRequest));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/import") {
        sendJson(response, 200, await receiveMediaFile(studio, request, url.searchParams.get("name") ?? ""));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/catalog/components/materialize") {
        sendJson(response, 200, await studio.materializeComponent(
          await jsonBody(request) as NleStudioComponentMaterializeRequest,
        ));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/catalog/adjusts/materialize") {
        sendJson(response, 200, await studio.materializeAdjust(
          await jsonBody(request) as NleStudioAdjustMaterializeRequest,
        ));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/catalog/transitions/materialize") {
        sendJson(response, 200, await studio.materializeTransition(
          await jsonBody(request) as NleStudioTransitionMaterializeRequest,
        ));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/inspector") {
        const body = await jsonBody(request) as NleStudioInspectorRequest;
        if (typeof body.item !== "string") throw new Error("NLE Studio Inspector requires an Item id.");
        sendJson(response, 200, studio.inspector(body.item));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/save") {
        sendJson(response, 200, await studio.save());
        return true;
      }
      if (request.method === "POST" && pathname === "/api/reload") {
        sendJson(response, 200, await studio.reload());
        return true;
      }
      if ((request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/api/resources/")) {
        const token = decodeURIComponent(pathname.slice("/api/resources/".length));
        if (token.length === 0 || token.includes("/")) throw new Error("NLE Studio resource token is invalid.");
        await sendResource(studio, request, response, token);
        return true;
      }
      if (request.method === "GET" && pathname.startsWith("/api/presentations/")) {
        const resource = decodeURIComponent(pathname.slice("/api/presentations/".length));
        if (resource.length === 0) throw new Error("NLE Studio presentation resource is invalid.");
        await sendPresentation(studio, response, resource);
        return true;
      }
      return request.method === "GET" && await sendStatic(response, pathname);
    } catch (error) {
      const conflict = error instanceof Error && error.name.includes("RevisionConflict");
      sendJson(response, conflict ? 409 : 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  },
};
