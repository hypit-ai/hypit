import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { writeFile } from "node:fs/promises";

import type { Plugin, ViteDevServer } from "vite";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { loadStudioRun } from "./run.js";
import { readStudioSession } from "./session.js";
import type { Range, StudioFailure, StudioSnapshot } from "./shared.js";

export type StudioPluginOptions = {
  readonly source: string;
  readonly runPath: string;
  readonly domain: StudioDomain;
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
  let requestedRevision = 0;
  let currentSource = options.source;
  const watched = new Map<string, FSWatcher>();

  const watchSource = (path: string): void => {
    if (watched.has(path)) return;
    try {
      watched.set(path, watch(path, () => schedule()));
    } catch {
      // Some Hosts may report virtual Source ids. They are still recompiled
      // whenever a real Source revision is scheduled; they simply emit no file event.
    }
  };

  const publish = async (attempt: number): Promise<void> => {
    try {
      // SVML and SVRun form one Studio source of truth. Recompile both for
      // every revision so a new Author graph is never executed through an old
      // Run plan.
      const run = await loadStudioRun({
        run: options.runPath,
        domain: options.domain,
        ...(options.archive === undefined ? {} : { archive: options.archive }),
      });
      currentSource = run.authorSource;
      watchSource(options.runPath);
      for (const unit of run.source.compiled.closure.units) watchSource(unit.id);
      const result = await readStudioSession({
        domain: options.domain,
        run,
        ...(options.archive === undefined ? {} : { archive: options.archive }),
        revision: attempt,
      });
      if (attempt !== requestedRevision) return;
      revision = attempt;
      snapshot = result.snapshot;
      material = result.material;
      failure = undefined;
      server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
    } catch (error) {
      if (attempt !== requestedRevision) return;
      revision = attempt;
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
    const attempt = ++requestedRevision;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void publish(attempt), 80);
  };

  return {
    name: "hypit-studio",
    configureServer(value) {
      server = value;
      watchSource(options.runPath);
      watchSource(currentSource);
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
              await writeFile(currentSource, body.text, "utf8");
              schedule();
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
            if (snapshot === undefined && failure === undefined) {
              const attempt = ++requestedRevision;
              await publish(attempt);
            }
            if (failure !== undefined && (snapshot === undefined || failure.revision > snapshot.revision)) {
              json(response, 500, failure);
            } else if (snapshot !== undefined) {
              json(response, 200, snapshot);
            } else {
              json(response, 500, failure);
            }
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
    async closeBundle() {
      for (const watcher of watched.values()) watcher.close();
      watched.clear();
      await options.archive?.close();
    },
  };
}
