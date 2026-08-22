import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, dirname, join } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { StudioAdapterRegistry } from "./studio-registry.js";
import { loadStudioRun } from "./run.js";
import { readStudioSession } from "./session.js";
import type { Range, StudioFailure, StudioSnapshot } from "./shared.js";
import { createStudioStoryboard } from "./storyboard.js";
import type { StudioStoryboard } from "./storyboard.js";
import { findSurfacePreview } from "./surface-preview.js";

export type StudioPluginOptions = {
  readonly source: string;
  readonly runPath: string;
  readonly domain: StudioDomain;
  readonly registry: StudioAdapterRegistry;
  readonly workspaceRoot: string;
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
  let allowedSourceFiles = new Set<string>();
  const watched = new Map<string, FSWatcher>();
  const storyboards = new Map<string, Promise<StudioStoryboard>>();

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
      allowedSourceFiles = new Set([
        options.runPath,
        run.authorSource,
        ...run.source.compiled.closure.units.map((unit) => unit.id).filter((path) => existsSync(path)),
      ].map((path) => resolve(path)));
      const result = await readStudioSession({
        domain: options.domain,
        registry: options.registry,
        run,
        ...(options.archive === undefined ? {} : { archive: options.archive }),
        revision: attempt,
        sourcePath: relative(options.workspaceRoot, run.authorSource),
        workspaceRoot: options.workspaceRoot,
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

  type Patch = {
    readonly path: string;
    readonly range: Range;
    readonly replacement: string;
    readonly preimage: string;
  };

  const applyTransaction = async (patches: readonly Patch[], expectedRevision: number): Promise<void> => {
    if (snapshot !== undefined && expectedRevision !== snapshot.revision) {
      throw new Error("The Source changed outside Studio.");
    }
    const grouped = new Map<string, Patch[]>();
    for (const patch of patches) {
      if (isAbsolute(patch.path)) throw new Error("Studio patches must use workspace-relative paths.");
      const absolute = resolve(options.workspaceRoot, patch.path);
      const rel = relative(options.workspaceRoot, absolute);
      if (rel.startsWith("..") || isAbsolute(rel) || !allowedSourceFiles.has(absolute)) {
        throw new Error(`Studio cannot write source file ${patch.path}.`);
      }
      if (!Number.isInteger(patch.range.start) || !Number.isInteger(patch.range.end)
        || patch.range.start < 0 || patch.range.end < patch.range.start) {
        throw new Error(`Invalid source range for ${patch.path}.`);
      }
      const held = grouped.get(absolute) ?? [];
      held.push(patch);
      grouped.set(absolute, held);
    }
    const nextFiles = new Map<string, string>();
    for (const [absolute, filePatches] of grouped) {
      const text = await readFile(absolute, "utf8");
      const ordered = [...filePatches].sort((left, right) => left.range.start - right.range.start);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1]!;
        const current = ordered[index]!;
        if (current.range.start < previous.range.end) {
          throw new Error(`Overlapping source patches are not allowed: ${relative(options.workspaceRoot, absolute)}.`);
        }
      }
      let next = text;
      for (const patch of [...filePatches].sort((left, right) => right.range.start - left.range.start)) {
        if (patch.range.end > text.length) throw new Error(`Source range exceeds file: ${patch.path}.`);
        const current = next.slice(patch.range.start, patch.range.end);
        if (current !== patch.preimage) throw new Error(`Source changed outside Studio: ${patch.path}.`);
        next = `${next.slice(0, patch.range.start)}${patch.replacement}${next.slice(patch.range.end)}`;
      }
      nextFiles.set(absolute, next);
    }
    // Validate every file before touching any file. Temp files make a single
    // multi-file write observable as one Studio transaction in normal hosts.
    const temporaries: { readonly path: string; readonly temporary: string }[] = [];
    try {
      for (const [absolute, text] of nextFiles) {
        const temporary = join(dirname(absolute), `.${absolute.split("/").at(-1) ?? "source"}.hypit-studio.tmp`);
        await writeFile(temporary, text, "utf8");
        temporaries.push({ path: absolute, temporary });
      }
      for (const item of temporaries) await rename(item.temporary, item.path);
    } finally {
      for (const item of temporaries) {
        try { await unlink(item.temporary); } catch { /* already renamed */ }
      }
    }
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
              const current = await readFile(currentSource, "utf8");
              await applyTransaction([{
                path: relative(options.workspaceRoot, currentSource),
                range: { start: 0, end: current.length },
                replacement: body.text,
                preimage: current,
              }], body.revision);
              schedule();
              response.statusCode = 202;
              response.end();
            } catch (error) {
              json(response, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          })();
          return;
        }
        if (request.method === "POST" && url.pathname === "/__studio/transaction") {
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                readonly revision?: unknown;
                readonly patches?: unknown;
              };
              if (typeof body.revision !== "number" || !Array.isArray(body.patches)) {
                json(response, 400, { error: "Expected a revision and source patches." });
                return;
              }
              const patches = body.patches as Patch[];
              if (patches.some((patch) => typeof patch.path !== "string"
                || typeof patch.replacement !== "string"
                || typeof patch.preimage !== "string"
                || typeof patch.range !== "object" || patch.range === null)) {
                json(response, 400, { error: "Invalid source patch." });
                return;
              }
              await applyTransaction(patches, body.revision);
              schedule();
              json(response, 202, { revision: body.revision });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              json(response, message.includes("changed outside") ? 409 : 500, { error: message });
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
        if (url.pathname === "/__studio/surface-preview") {
          void (async () => {
            const module = url.searchParams.get("module");
            const version = url.searchParams.get("version");
            const surface = url.searchParams.get("surface");
            const preview = module === null || version === null || surface === null
              ? undefined
              : findSurfacePreview(options.domain, { name: module, version }, surface);
            if (preview === undefined) {
              response.statusCode = 404;
              response.end();
              return;
            }
            const bytes = await preview.open();
            response.statusCode = 200;
            response.setHeader("content-type", preview.mediaType);
            response.setHeader("cache-control", "no-store");
            if (request.method === "HEAD") response.end();
            else response.end(Buffer.from(bytes));
          })().catch((error) => {
            json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
          return;
        }
        const storyboardDigest = /^\/__studio\/storyboard\/(sha256:[a-f0-9]{64})$/u.exec(url.pathname)?.[1];
        if (storyboardDigest !== undefined) {
          void (async () => {
            const file = material.get(storyboardDigest);
            if (file === undefined || !file.mediaType.startsWith("video/")) {
              response.statusCode = 404;
              response.end();
              return;
            }
            try {
              let pending = storyboards.get(storyboardDigest);
              if (pending === undefined) {
                pending = createStudioStoryboard(file);
                storyboards.set(storyboardDigest, pending);
              }
              const storyboard = await pending;
              response.statusCode = 200;
              response.setHeader("content-type", "image/png");
              response.setHeader("cache-control", "public, max-age=31536000, immutable");
              response.setHeader("x-hypit-storyboard-count", String(storyboard.count));
              response.setHeader("x-hypit-storyboard-columns", String(storyboard.columns));
              response.setHeader("x-hypit-storyboard-rows", String(storyboard.rows));
              response.setHeader("x-hypit-storyboard-tile-width", String(storyboard.tileWidth));
              response.setHeader("x-hypit-storyboard-tile-height", String(storyboard.tileHeight));
              response.setHeader("x-hypit-storyboard-sample-fps", String(storyboard.sampleFps));
              if (request.method === "HEAD") response.end();
              else response.end(Buffer.from(storyboard.bytes));
            } catch (error) {
              storyboards.delete(storyboardDigest);
              json(response, 500, { error: error instanceof Error ? error.message : String(error) });
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
