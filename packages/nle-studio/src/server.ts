#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { openLocalNleStudio } from "./host.js";
import type { NleStudioCommandRequest, NleStudioInspectorRequest } from "./protocol.js";

type CliOptions = {
  readonly projectPath: string;
  readonly viewPath?: string;
  readonly port: number;
};

function cliOptions(argv: readonly string[]): CliOptions {
  let projectPath: string | undefined;
  let viewPath: string | undefined;
  let port = 4317;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (flag === "--project" && value !== undefined) projectPath = value;
    else if (flag === "--view" && value !== undefined) viewPath = value;
    else if (flag === "--port" && value !== undefined) port = Number(value);
    else throw new Error(`Unknown or incomplete NLE Studio option: ${String(flag)}.`);
    index += 1;
  }
  if (projectPath === undefined) throw new Error("NLE Studio requires --project <project.svml>.");
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error("NLE Studio --port must be an integer from 0 through 65535.");
  }
  return viewPath === undefined ? { projectPath, port } : { projectPath, viewPath, port };
}

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

const options = cliOptions(process.argv.slice(2));
const studio = await openLocalNleStudio(options);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/session") {
      sendJson(response, 200, await studio.observe());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/command") {
      const body = await jsonBody(request) as NleStudioCommandRequest;
      sendJson(response, 200, await studio.command(body.command as NleEditingSurfaceCommand));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/inspector") {
      const body = await jsonBody(request) as NleStudioInspectorRequest;
      if (typeof body.item !== "string") throw new Error("NLE Studio Inspector requires an Item id.");
      sendJson(response, 200, studio.inspector(body.item));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/save") {
      sendJson(response, 200, await studio.save());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/reload") {
      sendJson(response, 200, await studio.reload());
      return;
    }
    if (request.method === "GET" && await sendStatic(response, url.pathname)) return;
    sendJson(response, 404, { error: "NLE Studio route not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = error instanceof Error && error.name.includes("RevisionConflict");
    sendJson(response, conflict ? 409 : 400, { error: message });
  }
});

const loopbackHost = "127.0.0.1";
server.listen(options.port, loopbackHost, () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  process.stdout.write(`Hypit NLE Studio: http://${loopbackHost}:${port}\n`);
  process.stdout.write(`Project: ${resolve(options.projectPath)}\n`);
});

function shutdown(): void {
  server.close(() => {
    studio.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
