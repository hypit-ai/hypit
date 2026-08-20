import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { RunPlan } from "./run.js";
import { readStudioSession } from "./session.js";
import type { Range, StudioFailure, StudioSnapshot } from "./shared.js";

export type StudioPluginOptions = {
  readonly source: string;
  readonly runPath: string;
  readonly domain: StudioDomain;
  readonly run: RunPlan;
  readonly archive?: StudioArchive;
};

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

function rangeOf(error: unknown): Range | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const range = (error as { readonly range?: unknown }).range;
  if (typeof range === "object" && range !== null && "start" in range && "end" in range) {
    return range as Range;
  }
  const offset = (error as { readonly offset?: unknown }).offset;
  return typeof offset === "number" && Number.isFinite(offset)
    ? { start: offset, end: offset + 1 }
    : undefined;
}

export function studioPlugin(options: StudioPluginOptions): Plugin {
  let snapshot: StudioSnapshot | undefined;
  let failure: StudioFailure | undefined;
  let material: ReadonlyMap<string, ServedFile> = new Map();
  let revision = 0;
  let server: ViteDevServer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = async (): Promise<void> => {
    revision += 1;
    try {
      const result = await readStudioSession({
        source: options.source,
        domain: options.domain,
        run: options.run,
        ...(options.archive === undefined ? {} : { archive: options.archive }),
        revision,
      });
      snapshot = result.snapshot;
      material = result.material;
      failure = undefined;
      server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
    } catch (error) {
      const range = rangeOf(error);
      failure = {
        revision,
        error: error instanceof Error ? error.message : String(error),
        ...(range === undefined ? {} : { range }),
      };
      server?.ws.send({ type: "custom", event: "studio:error", data: failure });
    }
  };

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void publish(), 80);
  };

  return {
    name: "hypit-studio",
    configureServer(value) {
      server = value;
      value.watcher.add([options.source, options.runPath]);
      value.watcher.on("change", (path) => {
        const changed = resolve(path);
        if (changed === options.source || changed === options.runPath || path.endsWith(".svs")) schedule();
      });
      value.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://studio.hypit.local");
        if (request.method === "PUT" && url.pathname === "/__studio/source") {
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                readonly text?: unknown;
                readonly revision?: unknown;
              };
              if (typeof body.text !== "string" || typeof body.revision !== "number") {
                json(response, 400, { error: "Expected source text and revision." });
                return;
              }
              if (snapshot !== undefined && body.revision !== snapshot.revision) {
                json(response, 409, { error: "The Source changed outside Studio." });
                return;
              }
              await writeFile(options.source, body.text, "utf8");
              await publish();
              response.statusCode = 202;
              response.end();
            } catch (error) {
              json(response, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          })();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        if (url.pathname === "/__studio/session") {
          void (async () => {
            if (snapshot === undefined && failure === undefined) await publish();
            if (snapshot !== undefined) json(response, 200, snapshot);
            else json(response, 500, failure);
          })();
          return;
        }
        const digest = /^\/__studio\/material\/(sha256:[a-f0-9]{64})$/u.exec(url.pathname)?.[1];
        if (digest !== undefined) {
          const file = material.get(digest);
          if (file === undefined) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", file.mediaType);
          response.setHeader("cache-control", "no-store");
          response.setHeader("accept-ranges", "bytes");
          if (request.method === "HEAD") response.end();
          else response.end(Buffer.from(file.bytes));
          return;
        }
        next();
      });
    },
    async closeBundle() { await options.archive?.close(); },
  };
}
