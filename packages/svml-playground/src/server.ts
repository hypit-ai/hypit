import { resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import type { ServedFile } from "./pipeline/compile.js";
import { readSource } from "./pipeline/session.js";
import type { PlaygroundFailure, PlaygroundSnapshot, Range } from "./shared.js";

export type SvmlPlaygroundOptions = {
  readonly source: string;
  /** The directory the author invoked from, so displayed paths read as typed. */
  readonly root: string;
  /** A Run Source, read for material it already names. */
  readonly run?: string;
  /** A Runtime profile, so material earlier builds produced can be read. */
  readonly runtime?: string;
  /** Where the installed packages live, as the Runtime profile expects. */
  readonly packageRoot: string;
};

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

/**
 * Hand over one piece of material.
 *
 * A picture is scrubbed, and a browser only seeks inside material its server
 * offers in parts: answer every request with the whole file and the media
 * element reports nothing as seekable, so every seek collapses to the first
 * frame and the take stands still while the playhead moves on. Serving the
 * asked-for bytes is what makes the timeline move real footage.
 */
function serveMaterial(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  file: ServedFile,
): void {
  const bytes = Buffer.from(file.bytes);
  response.setHeader("content-type", file.mediaType);
  response.setHeader("cache-control", "no-store");
  response.setHeader("accept-ranges", "bytes");

  // One range is what a media element asks for. A request for several is met
  // with the whole file, which is a legitimate answer to any range request.
  const asked = /^bytes=(\d*)-(\d*)$/u.exec((request.headers.range ?? "").trim());
  const from = asked?.[1] === undefined || asked[1] === "" ? undefined : Number(asked[1]);
  const to = asked?.[2] === undefined || asked[2] === "" ? undefined : Number(asked[2]);
  const start = from ?? (to === undefined ? 0 : Math.max(0, bytes.length - to));
  const end = from === undefined && to !== undefined ? bytes.length - 1 : Math.min(to ?? bytes.length - 1, bytes.length - 1);

  if (asked === null || start > end || start >= bytes.length) {
    // An unsatisfiable range is worth saying so: answering 200 instead would
    // have the element decode bytes it did not ask for.
    if (asked !== null) {
      response.statusCode = 416;
      response.setHeader("content-range", `bytes */${bytes.length}`);
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-length", String(bytes.length));
    response.end(request.method === "HEAD" ? undefined : bytes);
    return;
  }

  response.statusCode = 206;
  response.setHeader("content-range", `bytes ${start}-${end}/${bytes.length}`);
  response.setHeader("content-length", String(end - start + 1));
  response.end(request.method === "HEAD" ? undefined : bytes.subarray(start, end + 1));
}

function rangeOf(error: unknown): Range | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const range = (error as { range?: unknown }).range;
  if (typeof range === "object" && range !== null && "start" in range && "end" in range) {
    return range as Range;
  }
  // A parser error owns no element but does know where it gave up, which is
  // still the one place worth looking.
  const offset = (error as { offset?: unknown }).offset;
  return typeof offset === "number" && Number.isFinite(offset)
    ? { start: offset, end: offset + 1 }
    : undefined;
}

/**
 * Serve one Source as a read-only preview. The plugin owns no mutating route:
 * the Playground reads the file, watches it, and republishes. Nothing it exposes
 * can change what an author wrote.
 */
export function svmlPlaygroundPlugin(options: SvmlPlaygroundOptions): Plugin {
  let snapshot: PlaygroundSnapshot | undefined;
  let failure: PlaygroundFailure | undefined;
  let material: ReadonlyMap<string, ServedFile> = new Map();
  let revision = 0;
  let server: ViteDevServer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = async (): Promise<void> => {
    revision += 1;
    try {
      const result = await readSource({
        source: options.source,
        ...(options.run === undefined ? {} : { run: options.run }),
        ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
        packageRoot: options.packageRoot,
        revision,
      });
      snapshot = result.snapshot;
      material = result.material;
      failure = undefined;
      server?.ws.send({ type: "custom", event: "svml:snapshot", data: snapshot });
    } catch (error) {
      const range = rangeOf(error);
      failure = {
        revision,
        error: error instanceof Error ? error.message : String(error),
        ...(range === undefined ? {} : { range }),
      };
      server?.ws.send({ type: "custom", event: "svml:error", data: failure });
    }
  };

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void publish(), 80);
  };

  return {
    name: "hypit-svml-playground",
    configureServer(value) {
      server = value;
      value.watcher.add([options.source, ...(options.run === undefined ? [] : [options.run])]);
      value.watcher.on("change", (path) => {
        // Style sheets reached through a source import are watched too: their
        // Recipes decide placement and motion, so a change there changes the
        // timeline. Vite already watches everything under the project root.
        const changed = resolve(path);
        if (changed === options.source || changed === options.run || path.endsWith(".svs")) schedule();
      });
      value.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://hypit.local");
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        if (url.pathname === "/__svml/session") {
          void (async () => {
            if (snapshot === undefined && failure === undefined) await publish();
            if (snapshot !== undefined) json(response, 200, snapshot);
            else json(response, 500, failure);
          })();
          return;
        }
        const digest = /^\/__svml\/material\/(sha256:[a-f0-9]{64})$/u.exec(url.pathname)?.[1];
        if (digest !== undefined) {
          const file = material.get(digest);
          if (file === undefined) {
            response.statusCode = 404;
            response.end();
            return;
          }
          serveMaterial(request, response, file);
          return;
        }
        next();
      });
    },
  };
}
