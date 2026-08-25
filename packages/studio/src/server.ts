import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";
import type { StudioTemporalInstantProjection } from "@hypit/studio-adapter";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import { loadStudioRun } from "./run.js";
import { serializeParameterValue, validateParameterValue } from "./parameter-values.js";
import { readStudioSession } from "./session.js";
import type { Range, StudioFailure, StudioLibraryView, StudioMutation, StudioSnapshot } from "./shared.js";
import { createStudioStoryboard } from "./storyboard.js";
import type { StudioStoryboard } from "./storyboard.js";
import { findSurfacePreview } from "./surface-preview.js";
import { replaceSourceFiles } from "./source-transaction.js";

export type StudioPluginOptions = {
  readonly source: string;
  readonly runPath: string;
  readonly domain: StudioDomain;
  readonly registry: StudioCompanionRegistry;
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

function conflict(error: unknown): boolean {
  return error instanceof Error && /changed outside Studio|Source changed outside Studio|mutation is already in progress/u.test(error.message);
}

class StudioMutationRejected extends Error {}

export function studioPlugin(options: StudioPluginOptions): Plugin {
  let snapshot: StudioSnapshot | undefined;
  let failure: StudioFailure | undefined;
  let material: ReadonlyMap<string, ServedFile> = new Map();
  let revision = 0;
  let server: ViteDevServer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mutating = false;
  let publishing = 0;
  let requestedRevision = 0;
  let currentSource = options.source;
  let library: StudioLibraryView | undefined;
  let allowedSourceFiles = new Set<string>();
  const watched = new Map<string, FSWatcher>();
  const watchedFiles = new Set<string>();
  const storyboards = new Map<string, Promise<StudioStoryboard>>();

  const readLibrary = async (): Promise<StudioLibraryView> => {
    const next = await options.archive?.library() ?? {
      environment: options.workspaceRoot,
      tasks: [],
      artifacts: [],
    };
    library = next;
    return next;
  };

  const watchSource = (path: string): void => {
    const absolute = resolve(path);
    watchedFiles.add(absolute);
    const directory = dirname(absolute);
    if (watched.has(directory)) return;
    try {
      watched.set(directory, watch(directory, (_event, filename) => {
        const changed = filename === null ? undefined : resolve(directory, filename.toString());
        if (!mutating && (changed === undefined || watchedFiles.has(changed))) schedule();
      }));
    } catch {
      // Some Hosts may report virtual Source ids. They are still recompiled
      // whenever a real Source revision is scheduled; they simply emit no file event.
    }
  };

  const publish = async (attempt: number, notify = true): Promise<void> => {
    publishing += 1;
    try {
      // SVML and SVRun form one Studio source of truth. Recompile both for
      // every revision so a new Author graph is never executed through an old
      // Run plan.
      const run = await loadStudioRun({
        run: options.runPath,
        domain: options.domain,
        registry: options.registry,
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
      if (notify) server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
    } catch (error) {
      if (attempt !== requestedRevision) return;
      revision = attempt;
      const range = rangeOf(error);
      failure = {
        revision,
        error: error instanceof Error ? error.message : String(error),
        ...(range === undefined ? {} : { range }),
      };
      if (notify) server?.ws.send({ type: "custom", event: "studio:error", data: failure });
    } finally {
      publishing -= 1;
    }
  };

  const schedule = (): void => {
    const attempt = ++requestedRevision;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void publish(attempt);
    }, 80);
  };

  type Patch = {
    readonly path: string;
    readonly range: Range;
    readonly replacement: string;
    readonly preimage: string;
  };

  const applyTransaction = async (
    patches: readonly Patch[],
    expectedRevision: number,
  ): Promise<ReadonlyMap<string, string>> => {
    const sourceRevision = failure !== undefined && (snapshot === undefined || failure.revision > snapshot.revision)
      ? failure.revision
      : snapshot?.revision;
    if (sourceRevision !== undefined && expectedRevision !== sourceRevision) {
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
    const previousFiles = new Map<string, string>();
    for (const [absolute, filePatches] of grouped) {
      const text = await readFile(absolute, "utf8");
      previousFiles.set(absolute, text);
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
      if (next !== text) nextFiles.set(absolute, next);
    }
    await replaceSourceFiles(nextFiles);
    return new Map([...previousFiles].filter(([absolute]) => nextFiles.has(absolute)));
  };

  const currentClip = (entityId: string): StudioSnapshot["tracks"][number]["clips"][number] => {
    const found = snapshot?.tracks.flatMap((track) => track.clips).find((clip) => clip.id === entityId);
    if (found === undefined) throw new Error(`Studio entity ${entityId} no longer exists.`);
    return found;
  };

  const timelinePatches = async (
    mutation: Extract<StudioMutation, { readonly type: "timeline.adjust" }>,
  ): Promise<readonly Patch[]> => {
    const clip = currentClip(mutation.entityId);
    const handle = clip.editHandles.find((candidate) =>
      candidate.operation === "timeline.adjust"
      && candidate.gesture === mutation.gesture
      && candidate.enabled);
    if (handle === undefined) throw new Error(`Entity ${mutation.entityId} does not allow ${mutation.gesture}.`);

    const temporal = handle.temporal;
    if (temporal === undefined) throw new Error("This timeline entity has no authoring authority.");
    if (temporal.kind !== mutation.target.kind) {
      throw new Error(`This timeline entity requires a ${temporal.kind} mutation target.`);
    }
    const startFrame = mutation.target.kind === "instant" ? mutation.target.frame : mutation.target.startFrame;
    const endFrameExclusive = mutation.target.kind === "instant" ? mutation.target.frame + 1 : mutation.target.endFrameExclusive;
    if (!Number.isInteger(startFrame) || startFrame < 0
      || (mutation.target.kind === "window"
        && (!Number.isInteger(endFrameExclusive) || endFrameExclusive <= startFrame))) {
      throw new Error("A timeline target must use valid whole frames.");
    }
    if (temporal.kind === "window") {
      if (mutation.gesture === "move"
        && endFrameExclusive - startFrame !== clip.endFrameExclusive - clip.startFrame) {
        throw new Error("Move must preserve the Window duration.");
      }
      if (mutation.gesture === "trim-start" && endFrameExclusive !== clip.endFrameExclusive) {
        throw new Error("Trim start cannot change the Window end.");
      }
      if (mutation.gesture === "trim-end" && startFrame !== clip.startFrame) {
        throw new Error("Trim end cannot change the Window start.");
      }
    } else if (mutation.gesture !== "move") {
      throw new Error("An Instant only supports move.");
    }

    const patches: Patch[] = [];
    const semanticTarget = mutation.target.semantic;
    if (semanticTarget !== undefined) {
      if (handle.semantic?.kind !== semanticTarget.kind) {
        throw new Error(`Entity ${mutation.entityId} is not bound to a writable ${semanticTarget.kind}.`);
      }
      const current = snapshot;
      const script = current?.script;
      if (current === undefined || script === undefined) throw new Error("Studio has no writable Script source map.");
      if (handle.semantic.narrativeId !== current.semantic.narrativeId
        || script.narrativeId !== current.semantic.narrativeId) {
        throw new Error("The timeline entity and writable Script do not belong to the selected Narrative.");
      }
      if (semanticTarget.kind === "selection") {
        const startIndex = current.semantic.anchors.findIndex((anchor) => anchor.id === semanticTarget.startAnchorId);
        const endIndex = current.semantic.anchors.findIndex((anchor) => anchor.id === semanticTarget.endAnchorId);
        if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex
          || current.semantic.anchors[startIndex]!.frame >= current.semantic.anchors[endIndex]!.frame) {
          throw new Error("A Selection must span two ordered semantic Anchors with positive time.");
        }
      } else if (!current.semantic.anchors.some((anchor) => anchor.id === semanticTarget.anchorId)) {
        throw new Error(`Moment Anchor ${semanticTarget.anchorId} does not exist in the current semantic Candidate.`);
      }
      const absolute = resolve(options.workspaceRoot, script.sourcePath);
      const source = await readFile(absolute, "utf8");
      if (script.content.start < 0 || script.content.end < script.content.start || script.content.end > source.length) {
        throw new Error("The current Script source range is invalid.");
      }
      const body = source.slice(script.content.start, script.content.end);
      const replacement = options.registry.adjustScript({
        companion: script.companion,
        sourceName: script.sourcePath,
        source: body,
        adjustment: semanticTarget.kind === "selection"
          ? {
              kind: "selection",
              id: handle.semantic.id,
              startAnchorId: semanticTarget.startAnchorId,
              endAnchorId: semanticTarget.endAnchorId,
            }
          : { kind: "moment", id: handle.semantic.id, anchorId: semanticTarget.anchorId },
      });
      if (replacement !== body) patches.push({
        path: relative(options.workspaceRoot, absolute), range: script.content, replacement, preimage: body,
      });
    }

    const source = (role: "start" | "end" | "duration") =>
      handle.sources?.find((candidate) => candidate.role === role)?.source;
    const frame = (value: number): string => `${value}f`;
    const semanticFrame = (endpoint: StudioTemporalInstantProjection): number | undefined => {
      if (endpoint.authority.kind !== "semantic" || semanticTarget === undefined || handle.semantic === undefined) return undefined;
      if (endpoint.source.kind === "selection" && semanticTarget.kind === "selection"
        && endpoint.source.id === handle.semantic.id) {
        const anchorId = endpoint.authority.boundary === "start"
          ? semanticTarget.startAnchorId
          : semanticTarget.endAnchorId;
        return snapshot?.semantic.anchors.find((anchor) => anchor.id === anchorId)?.frame;
      }
      if (endpoint.source.kind === "moment" && semanticTarget.kind === "moment"
        && endpoint.source.id === handle.semantic.id) {
        return snapshot?.semantic.anchors.find((anchor) => anchor.id === semanticTarget.anchorId)?.frame;
      }
      return undefined;
    };
    const projectionBaseFrame = (endpoint: StudioTemporalInstantProjection): number | undefined => {
      if (endpoint.reference === "absolute") return undefined;
      if (endpoint.reference === "program.start") return 0;
      if (endpoint.reference === "program.end") return snapshot?.space.frameCount;
      const id = endpoint.source.id;
      if (id === undefined) return undefined;
      if (endpoint.reference === "selection.start" || endpoint.reference === "selection.end") {
        const selection = snapshot?.semantic.selections.find((candidate) => candidate.id === id);
        return endpoint.reference === "selection.start" ? selection?.startFrame : selection?.endFrameExclusive;
      }
      if (endpoint.reference === "segment.start" || endpoint.reference === "segment.end") {
        const segment = snapshot?.semantic.segments.find((candidate) => candidate.id === id);
        return endpoint.reference === "segment.start" ? segment?.startFrame : segment?.endFrameExclusive;
      }
      return snapshot?.semantic.moments.find((candidate) => candidate.id === id)?.frame;
    };
    const projectedPointValue = (endpoint: StudioTemporalInstantProjection, desired: number): string => {
      if (endpoint.reference === "absolute") return frame(desired);
      const base = projectionBaseFrame(endpoint);
      if (base === undefined) throw new Error(`The ${endpoint.reference} projection base is unavailable.`);
      const offset = desired - base;
      return offset === 0 ? endpoint.reference : `${endpoint.reference}${offset > 0 ? "+" : ""}${offset}f`;
    };
    const writeEndpoint = (
      endpoint: StudioTemporalInstantProjection,
      desired: number,
      role: "start" | "end",
    ): void => {
      if (desired === endpoint.frame) return;
      if (endpoint.authority.kind === "fixed") throw new Error(`The ${role} endpoint is structurally fixed.`);
      if (endpoint.authority.kind === "semantic") {
        if (semanticFrame(endpoint) !== desired) throw new Error(`The ${role} endpoint does not match its semantic Anchor.`);
        return;
      }
      if (endpoint.authority.relation !== "direct") return;
      const author = source(role);
      if (author === undefined) throw new Error(`The ${role} projection has no writable Source binding.`);
      patches.push({ ...author, replacement: projectedPointValue(endpoint, desired) });
    };
    if (temporal.kind === "instant") {
      writeEndpoint(temporal, startFrame, "start");
    } else {
      writeEndpoint(temporal.start, startFrame, "start");
      writeEndpoint(temporal.end, endFrameExclusive, "end");
      const derived = [temporal.start, temporal.end].find((endpoint) =>
        endpoint.authority.kind === "parameter" && endpoint.authority.relation !== "direct");
      if (derived !== undefined
        && endFrameExclusive - startFrame !== temporal.endFrameExclusive - temporal.startFrame) {
        const author = source("duration");
        if (author === undefined) throw new Error("The projected duration has no writable Source binding.");
        patches.push({ ...author, replacement: frame(endFrameExclusive - startFrame) });
      }
    }
    return patches.filter((patch) => patch.replacement !== patch.preimage);
  };

  const mutationPatches = async (mutation: StudioMutation): Promise<readonly Patch[]> => {
    if (mutation.type === "timeline.adjust") return timelinePatches(mutation);
    const clip = currentClip(mutation.entityId);
    const parameter = clip.inspector.find((candidate) => candidate.id === mutation.parameterId);
    if (parameter === undefined) {
      throw new Error(`Entity ${mutation.entityId} has no writable parameter ${mutation.parameterId}.`);
    }
    if (parameter.schema !== undefined) {
      validateParameterValue(mutation.value, parameter.schema, parameter.label);
    } else if (parameter.control === "boolean" && typeof mutation.value !== "boolean") {
      throw new Error(`${parameter.label} expects true or false.`);
    } else if (parameter.control === "number" && (typeof mutation.value !== "number" || !Number.isFinite(mutation.value))) {
      throw new Error(`${parameter.label} expects a number.`);
    } else if ((parameter.control === "text" || parameter.control === "color" || parameter.control === "select")
      && typeof mutation.value !== "string") {
      throw new Error(`${parameter.label} expects text.`);
    }
    if (parameter.options !== undefined && (typeof mutation.value !== "string" || !parameter.options.includes(mutation.value))) {
      throw new Error(`${parameter.label} does not accept ${mutation.value}.`);
    }
    const encoded = serializeParameterValue(mutation.value, parameter.language);
    const replacement = `${parameter.source.prefix ?? ""}${encoded}${parameter.source.suffix ?? ""}`;
    return replacement === parameter.source.preimage ? [] : [{
      ...parameter.source,
      replacement,
    }];
  };

  const commitMutation = async (mutation: StudioMutation): Promise<number> => {
    if (mutating) throw new Error("A Studio author mutation is already in progress.");
    if (timer !== undefined || publishing > 0 || snapshot === undefined
      || mutation.revision !== snapshot.revision || requestedRevision !== snapshot.revision
      || (failure !== undefined && failure.revision >= snapshot.revision)) {
      throw new Error("The Source changed outside Studio.");
    }
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    mutating = true;
    try {
      const patches = await mutationPatches(mutation);
      if (patches.length === 0) return snapshot.revision;
      const previous = await applyTransaction(patches, mutation.revision);
      const attempt = ++requestedRevision;
      await publish(attempt, false);
      if (failure?.revision !== attempt) {
        server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
        return attempt;
      }
      const rejected = failure.error;
      await replaceSourceFiles(previous);
      await publish(++requestedRevision, false);
      server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
      throw new StudioMutationRejected(rejected);
    } finally {
      mutating = false;
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
            let acquired = false;
            try {
              if (mutating || timer !== undefined || publishing > 0) {
                throw new Error("A Studio author mutation is already in progress.");
              }
              mutating = true;
              acquired = true;
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                readonly text?: unknown;
                readonly revision?: unknown;
                readonly path?: unknown;
              };
              if (typeof body.text !== "string" || typeof body.revision !== "number"
                || (body.path !== undefined && typeof body.path !== "string")) {
                json(response, 400, { error: "Expected source path, text and revision." });
                return;
              }
              const sourceRevision = failure !== undefined && (snapshot === undefined || failure.revision > snapshot.revision)
                ? failure.revision
                : snapshot?.revision;
              if (sourceRevision !== undefined && body.revision !== sourceRevision) {
                json(response, 409, { error: "The Source changed outside Studio." });
                return;
              }
              const sourcePath = body.path ?? relative(options.workspaceRoot, currentSource);
              const absolute = resolve(options.workspaceRoot, sourcePath);
              if (isAbsolute(sourcePath) || !allowedSourceFiles.has(absolute)) {
                throw new Error(`Studio cannot write source file ${sourcePath}.`);
              }
              const current = await readFile(absolute, "utf8");
              await applyTransaction([{
                path: sourcePath,
                range: { start: 0, end: current.length },
                replacement: body.text,
                preimage: current,
              }], body.revision);
              const attempt = ++requestedRevision;
              await publish(attempt);
              json(response, 202, { revision: attempt });
            } catch (error) {
              json(response, conflict(error) ? 409 : 500, { error: error instanceof Error ? error.message : String(error) });
            } finally {
              if (acquired) mutating = false;
            }
          })();
          return;
        }
        if (request.method === "POST" && url.pathname === "/__studio/mutation") {
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<StudioMutation>;
              if ((body.type !== "timeline.adjust" && body.type !== "parameter.adjust")
                || typeof body.revision !== "number"
                || typeof body.entityId !== "string") {
                json(response, 400, { error: "Expected a Studio author mutation." });
                return;
              }
              if (body.type === "timeline.adjust"
                && (typeof body.gesture !== "string" || typeof body.target !== "object" || body.target === null)) {
                json(response, 400, { error: "Expected a timeline gesture and target." });
                return;
              }
              if (body.type === "parameter.adjust"
                && (typeof body.parameterId !== "string" || body.value === undefined)) {
                json(response, 400, { error: "Expected a parameter identity and value." });
                return;
              }
              const committed = await commitMutation(body as StudioMutation);
              json(response, 200, { revision: committed });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              json(response, conflict(error) ? 409 : error instanceof StudioMutationRejected ? 422 : 500, { error: message });
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
        if (url.pathname === "/__studio/library") {
          void readLibrary().then(
            (view) => json(response, 200, view),
            (error) => json(response, 500, { error: error instanceof Error ? error.message : String(error) }),
          );
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
        const artifactDigest = /^\/__studio\/artifact\/(sha256:[a-f0-9]{64})$/u.exec(url.pathname)?.[1];
        if (artifactDigest !== undefined) {
          void (async () => {
            const view = library ?? await readLibrary();
            const artifact = view.artifacts.find((item) => item.digest === artifactDigest);
            if (artifact === undefined || options.archive === undefined) {
              response.statusCode = 404;
              response.end();
              return;
            }
            const bytes = await options.archive.read(artifactDigest as import("@hypit/protocol").Digest);
            if (bytes === undefined) {
              response.statusCode = 404;
              response.end();
              return;
            }
            response.statusCode = 200;
            response.setHeader("content-type", artifact.mediaType);
            response.setHeader("content-length", String(bytes.byteLength));
            response.setHeader("cache-control", "private, max-age=31536000, immutable");
            if (request.method === "HEAD") response.end();
            else response.end(Buffer.from(bytes));
          })().catch((error) => {
            json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
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
