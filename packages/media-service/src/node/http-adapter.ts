import { open } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

import { mediaAssetDocumentFormat } from "@hypit/media-asset";
import {
  assertProjectObjectRef,
  projectObjectRef,
  type ProjectObjectRef,
} from "@hypit/project";

import type {
  ProjectMediaCatalogView,
  ProjectMediaRepresentationCommand,
} from "../types.js";
import { createNodeProjectMediaService } from "./service.js";
import {
  ProjectMediaRevisionConflict,
  type NodeProjectMediaService,
} from "./types.js";
import { nodeFileObservationRevision } from "./file-observation.js";

const mediaPath = "/api/project/media";
const requestLimit = 1_048_576;

export type NodeProjectMediaHttpServer = {
  readonly origin: string;
  readonly mediaUrl: string;
  readonly eventsUrl: string;
  close(): Promise<void>;
};

type EventSession = { close(): void };

class ProjectMediaResourceRevisionConflict extends Error {
  readonly name = "ProjectMediaResourceRevisionConflict";

  constructor(
    readonly asset: ProjectObjectRef,
    readonly expectedRevision: string,
    readonly actualRevision: string,
  ) {
    super(`Media Asset ${asset.path} resource changed after it was observed.`);
  }
}

function loopbackOrigin(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const names = new Set(allowed);
  for (const name of Object.keys(value)) {
    if (!names.has(name)) throw new Error(`${subject} contains unknown field ${name}.`);
  }
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > requestLimit) throw new Error("Project Media request body exceeds 1 MiB.");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) throw new Error("Project Media request body is empty.");
  return JSON.parse(text) as unknown;
}

function representationCommand(value: unknown): ProjectMediaRepresentationCommand {
  const input = object(value, "Project Media Representation command");
  if (input.kind !== "representation.attach"
    && input.kind !== "representation.replace"
    && input.kind !== "representation.detach") {
    throw new Error("Project Media Representation command kind is invalid.");
  }
  exactFields(input, input.kind === "representation.attach"
    ? ["kind", "asset", "assetRevision", "representation"]
    : input.kind === "representation.replace"
      ? ["kind", "asset", "assetRevision", "id", "representation"]
      : ["kind", "asset", "assetRevision", "id"], "Project Media Representation command");
  const asset = input.asset as ProjectObjectRef;
  assertProjectObjectRef(asset);
  if (asset.format !== mediaAssetDocumentFormat) {
    throw new Error(`Project Media command requires ${mediaAssetDocumentFormat}.`);
  }
  if (typeof input.assetRevision !== "string" || input.assetRevision.length === 0) {
    throw new Error("Project Media Representation command assetRevision is required.");
  }
  if (input.kind === "representation.attach") {
    object(input.representation, "Project Media Representation declaration");
  } else {
    if (typeof input.id !== "string" || input.id.length === 0) {
      throw new Error("Project Media Representation id is required.");
    }
    if (input.kind === "representation.replace") {
      object(input.representation, "Project Media Representation declaration");
    }
  }
  return structuredClone(input) as ProjectMediaRepresentationCommand;
}

function errorView(error: unknown): unknown {
  const source = error instanceof Error ? error : new Error(String(error));
  const conflict = source instanceof ProjectMediaRevisionConflict
    || source instanceof ProjectMediaResourceRevisionConflict ? source : undefined;
  return {
    format: "hypit.media-service-error@1",
    error: {
      name: source.name,
      message: source.message,
      ...(conflict === undefined ? {} : {
        asset: conflict.asset,
        expectedRevision: conflict.expectedRevision,
        actualRevision: conflict.actualRevision,
        observe: mediaPath,
      }),
    },
  };
}

async function serveResource(
  request: IncomingMessage,
  response: ServerResponse,
  service: NodeProjectMediaService,
  url: URL,
): Promise<void> {
  const path = url.searchParams.get("asset");
  const revision = url.searchParams.get("revision");
  if (path === null || revision === null || revision.length === 0) {
    throw new Error("Project Media resource requires asset and revision.");
  }
  const asset = projectObjectRef(path, mediaAssetDocumentFormat);
  const resource = service.resource(asset);
  if (resource === undefined) throw new Error(`Media Asset ${asset.path} resource is unavailable.`);
  if (resource.revision !== revision) {
    throw new ProjectMediaResourceRevisionConflict(asset, revision, resource.revision);
  }
  const handle = await open(resource.file, "r");
  const actual = nodeFileObservationRevision(await handle.stat());
  if (actual !== revision) {
    await handle.close();
    await service.refresh();
    throw new ProjectMediaResourceRevisionConflict(
      asset,
      revision,
      service.resource(asset)?.revision ?? actual,
    );
  }
  response.writeHead(200, {
    "accept-ranges": "none",
    "cache-control": "no-store",
    "content-length": String(resource.size),
    "content-type": resource.mediaType,
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") {
    await handle.close();
    response.end();
    return;
  }
  await pipeline(handle.createReadStream(), response);
}

function catalogEvent(catalog: ProjectMediaCatalogView): string {
  return `event: catalog\nid: ${catalog.generation}\ndata: ${JSON.stringify(catalog)}\n\n`;
}

function openEvents(
  request: IncomingMessage,
  response: ServerResponse,
  service: NodeProjectMediaService,
  sessions: Set<EventSession>,
): void {
  response.writeHead(200, {
    "cache-control": "no-store",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
    "x-content-type-options": "nosniff",
  });
  response.write(": media-service\n\n");
  let closed = false;
  let dirty = true;
  let pumping = false;
  let published = 0;
  let unsubscribe = (): void => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const session: EventSession = { close };
  function close(): void {
    if (closed) return;
    closed = true;
    if (heartbeat !== undefined) clearInterval(heartbeat);
    unsubscribe();
    sessions.delete(session);
    response.end();
  }
  const pump = async (): Promise<void> => {
    if (closed || pumping) return;
    pumping = true;
    try {
      while (dirty && !closed) {
        dirty = false;
        const catalog = await service.observe();
        if (catalog.generation !== published) {
          published = catalog.generation;
          response.write(catalogEvent(catalog));
        }
      }
    } catch (error) {
      if (!closed) {
        response.write(`event: error\ndata: ${JSON.stringify(errorView(error))}\n\n`);
        close();
      }
    } finally {
      pumping = false;
      if (dirty && !closed) void pump();
    }
  };
  unsubscribe = service.subscribe(() => {
    dirty = true;
    void pump();
  });
  heartbeat = setInterval(() => {
    if (!closed) response.write(": keepalive\n\n");
  }, 15_000);
  heartbeat.unref();
  sessions.add(session);
  request.once("close", close);
  response.once("close", close);
  void pump();
}

/** Loopback HTTP projection of one Project-scoped Media application service. */
export async function startNodeProjectMediaHttpServer(options: {
  readonly projectRoot: string;
  readonly media?: NodeProjectMediaService;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
}): Promise<NodeProjectMediaHttpServer> {
  const projectRoot = resolve(options.projectRoot);
  const media = options.media ?? createNodeProjectMediaService(projectRoot);
  const ownsMedia = options.media === undefined;
  if (resolve(media.projectRoot) !== projectRoot) {
    if (ownsMedia) await media.close();
    throw new Error("Media Service HTTP adapter belongs to a different Project Boundary.");
  }
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    if (ownsMedia) await media.close();
    throw new Error("Media Service HTTP adapter port must be an integer from 0 through 65535.");
  }
  const events = new Set<EventSession>();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://media-service.local");
      if (request.method === "GET" && url.pathname === mediaPath) {
        json(response, 200, await media.observe());
        return;
      }
      if (request.method === "POST" && url.pathname === `${mediaPath}/refresh`) {
        json(response, 200, await media.refresh());
        return;
      }
      if (request.method === "GET" && url.pathname === `${mediaPath}/events`) {
        openEvents(request, response, media, events);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname === `${mediaPath}/resource`) {
        await serveResource(request, response, media, url);
        return;
      }
      if (request.method === "POST" && url.pathname === `${mediaPath}/representation`) {
        if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
          throw new Error("Project Media Representation command requires application/json.");
        }
        const receipt = await media.commitRepresentation(representationCommand(await requestJson(request)));
        json(response, 200, receipt);
        return;
      }
      json(response, 404, errorView(new Error(`Unknown Project Media route: ${url.pathname}`)));
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      json(response, error instanceof ProjectMediaRevisionConflict
        || error instanceof ProjectMediaResourceRevisionConflict ? 409 : 400, errorView(error));
    }
  });

  try {
    await new Promise<void>((fulfill, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => { server.removeListener("error", reject); fulfill(); });
    });
  } catch (error) {
    if (ownsMedia) await media.close();
    throw error;
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    if (ownsMedia) await media.close();
    throw new Error("Media Service HTTP adapter did not bind a TCP address.");
  }
  const origin = loopbackOrigin(host, address.port);
  let closed = false;
  return {
    origin,
    mediaUrl: `${origin}${mediaPath}`,
    eventsUrl: `${origin}${mediaPath}/events`,
    async close() {
      if (closed) return;
      closed = true;
      for (const event of [...events]) event.close();
      await new Promise<void>((fulfill, reject) =>
        server.close((error) => error === undefined ? fulfill() : reject(error)));
      if (ownsMedia) await media.close();
    },
  };
}
