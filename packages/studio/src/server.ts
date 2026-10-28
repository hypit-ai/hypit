import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { Plugin, ViteDevServer } from "vite";
import type { BuildResultFileRange } from "@hypit/hypit/result";
import type { StudioTemporalInstantProjection } from "@hypit/studio-companion";

import type { StudioBuildLibrary } from "./build-library.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import { loadStudioPlan } from "./invocation.js";
import type { StudioInvocationSelection } from "./invocation.js";
import { allowsStudioMutation } from "./mutation-origin.js";
import { parameterAuthorValue, parameterOption, serializeParameterValue, serializeAttributeGroup, validateParameterValue } from "./parameter-values.js";
import { readStudioSession } from "./session.js";
import type { StudioSession } from "./session.js";
import type { Range, StudioFailure, StudioItemAddress, StudioLibraryRequest, StudioLibraryView, StudioMutation, StudioSnapshot, StudioTrackAddress } from "./shared.js";
import { sameStudioItemAddress, sameStudioTrackAddress } from "./shared.js";
import { createStudioStoryboard, createStudioWaveform } from "./storyboard.js";
import type { StudioStoryboard } from "./storyboard.js";
import { findDeclarationPreview } from "./declaration-preview.js";
import { domainGestureSpan } from "./temporal-edit.js";
import { planTemporalInverse, temporalAuthorBindings } from "./temporal-inverse.js";
import { replaceSourceFiles } from "./source-transaction.js";
import { createSourceWatch } from "./source-watch.js";

export type StudioPluginOptions = {
  readonly source: string;
  readonly selection: StudioInvocationSelection;
  readonly domain: StudioDomain;
  readonly registry: StudioCompanionRegistry;
  readonly workspaceRoot: string;
  readonly buildLibrary?: StudioBuildLibrary;
};

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

function requestedByteRange(value: string | undefined, size: number): BuildResultFileRange | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (match === null || (match[1]!.length === 0 && match[2]!.length === 0) || size === 0) {
    throw new RangeError("requested byte range is not satisfiable");
  }
  if (match[1]!.length === 0) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError("requested byte range is not satisfiable");
    return { start: Math.max(0, size - suffix), endExclusive: size };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2]!.length === 0 ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0
    || start >= size || requestedEnd < start) {
    throw new RangeError("requested byte range is not satisfiable");
  }
  return { start, endExclusive: Math.min(size, requestedEnd + 1) };
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
  let visualHtml: string | undefined;
  let visualDocument: import("@hypit/html-program").HtmlProgram | undefined;
  let failure: StudioFailure | undefined;
  let material: ReadonlyMap<string, ServedFile> = new Map();
  let temporalEdit: StudioSession["temporalEdit"] | undefined;
  let revision = 0;
  let server: ViteDevServer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mutating = false;
  let publishing = 0;
  let publication: Promise<void> = Promise.resolve();
  let requestedRevision = 0;
  let currentSource = options.source;
  let allowedSourceFiles = new Set<string>();
  const sourceWatch = createSourceWatch(
    () => { if (!mutating) schedule(); },
    message => server?.config.logger.warn(message),
  );
  const storyboards = new Map<string, Promise<StudioStoryboard>>();
  const waveforms = new Map<string, Promise<Uint8Array>>();
  let waveformQueue: Promise<unknown> = Promise.resolve();
  let storyboardQueue: Promise<unknown> = Promise.resolve();

  const readLibrary = async (request: StudioLibraryRequest): Promise<StudioLibraryView> => {
    return await options.buildLibrary?.library(request) ?? {
      section: request.section,
      environment: options.workspaceRoot,
      tasks: [],
      artifacts: [],
    };
  };

  const publishRevision = async (attempt: number, notify: boolean): Promise<void> => {
    try {
      // Recompile the Author Source and explicit Invocation for every revision.
      const plan = await loadStudioPlan({
        selection: options.selection,
        domain: options.domain,
        registry: options.registry,
      });
      if (attempt !== requestedRevision) return;
      currentSource = plan.authorSource;
      sourceWatch.replace([
        ...(plan.invocationSource === undefined ? [] : [resolve(plan.invocationSource)]),
        resolve(plan.authorSource),
        ...plan.source.compiled.closure.units.map(unit => unit.id),
      ]);
      allowedSourceFiles = new Set([
        ...(plan.invocationSource === undefined ? [] : [plan.invocationSource]),
        plan.authorSource,
        ...plan.source.compiled.closure.units.map((unit) => unit.id).filter((path) => existsSync(path)),
      ].map((path) => resolve(path)));
      const result = await readStudioSession({
        domain: options.domain,
        registry: options.registry,
        plan,
        ...(options.buildLibrary?.transientExecution === undefined
          ? {}
          : { transientExecution: options.buildLibrary.transientExecution }),
        revision: attempt,
        sourcePath: relative(options.workspaceRoot, plan.authorSource),
        workspaceRoot: options.workspaceRoot,
      });
      if (attempt !== requestedRevision) return;
      for (const issue of result.declarationIssues) server?.config.logger.warn(issue);
      revision = attempt;
      snapshot = result.snapshot;
      visualHtml = result.visualHtml;
      visualDocument = result.document;
      material = result.material;
      storyboards.clear();
      waveforms.clear();
      temporalEdit = result.temporalEdit;
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
    }
  };

  // Source changes supersede queued revisions; readers share the in-flight compilation.
  const publish = (attempt: number, notify = true): Promise<void> => {
    publishing += 1;
    const next = publication.then(async () => {
      if (attempt === requestedRevision) await publishRevision(attempt, notify);
    }).finally(() => { publishing -= 1; });
    publication = next;
    return next;
  };

  const ensureSnapshot = async (): Promise<void> => {
    if (snapshot !== undefined || failure !== undefined) return;
    if (publishing === 0) await publish(++requestedRevision);
    else await publication;
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
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !allowedSourceFiles.has(absolute)) {
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

  const itemLabel = (address: StudioItemAddress): string => `${address.track.output}/${address.track.attachment ?? "root"}/${address.item}`;
  const currentItem = (address: StudioItemAddress): StudioSnapshot["tracks"][number]["items"][number] => {
    const found = snapshot?.tracks.flatMap((track) => track.items)
      .find((item) => sameStudioItemAddress(item.address, address));
    if (found === undefined) throw new Error(`Studio Item ${itemLabel(address)} no longer exists.`);
    return found;
  };

  const currentParameterOwner = (
    owner: Extract<StudioMutation, { readonly type: "parameter.adjust" }>["owner"],
  ): { readonly label: string; readonly inspector: StudioSnapshot["tracks"][number]["items"][number]["inspector"] } => {
    if (owner.kind === "item") {
      const item = currentItem(owner.item);
      return { label: `Item ${itemLabel(owner.item)}`, inspector: item.inspector };
    }
    const track = snapshot?.tracks.find((candidate) => sameStudioTrackAddress(candidate.address, owner.track));
    const object = track?.inspectorObjects.find((candidate) => candidate.id === owner.objectId);
    if (object === undefined) throw new Error(`Studio Inspector object ${owner.objectId} no longer exists.`);
    return { label: `Inspector object ${owner.objectId}`, inspector: object.inspector };
  };

  const timelinePatches = async (
    mutation: Extract<StudioMutation, { readonly type: "timeline.adjust" }>,
  ): Promise<readonly Patch[]> => {
    const item = currentItem(mutation.item);
    const handle = item.editHandles.find((candidate) =>
      candidate.operation === "timeline.adjust"
      && candidate.gesture === mutation.gesture
      && candidate.enabled);
    if (handle === undefined) throw new Error(`Item ${itemLabel(mutation.item)} does not allow ${mutation.gesture}.`);

    const temporal = handle.temporal;
    if (temporal === undefined) throw new Error("This timeline Item has no authoring authority.");
    if (temporal.kind !== mutation.target.kind) {
      throw new Error(`This timeline Item requires a ${temporal.kind} mutation target.`);
    }
    const startFrame = mutation.target.kind === "instant" ? mutation.target.frame : mutation.target.startFrame;
    const endFrameExclusive = mutation.target.kind === "instant" ? mutation.target.frame + 1 : mutation.target.endFrameExclusive;
    if (!Number.isInteger(startFrame) || startFrame < 0
      || (mutation.target.kind === "window"
        && (!Number.isInteger(endFrameExclusive) || endFrameExclusive <= startFrame))) {
      throw new Error("A timeline target must use valid whole frames.");
    }
    if (temporal.kind === "window") {
      if (mutation.gesture === "move" && handle.domain?.kind !== "span"
        && endFrameExclusive - startFrame !== item.endFrameExclusive - item.startFrame) {
        throw new Error("Move must preserve the Window duration.");
      }
      if (mutation.gesture === "trim-start" && endFrameExclusive !== item.endFrameExclusive) {
        throw new Error("Trim start cannot change the Window end.");
      }
      if (mutation.gesture === "trim-end" && startFrame !== item.startFrame) {
        throw new Error("Trim end cannot change the Window start.");
      }
    } else if (mutation.gesture !== "move") {
      throw new Error("An Instant only supports move.");
    }

    const patches: Patch[] = [];
    const domainTarget = mutation.target.domain;
    if (handle.domain !== undefined && domainTarget === undefined) throw new Error("A temporal-domain edit requires explicit target anchors.");
    if (domainTarget !== undefined) {
      if (handle.domain?.kind !== domainTarget.kind
        || handle.domain.companion !== domainTarget.companion
        || handle.domain.domainId !== domainTarget.domainId
        || handle.domain.itemId !== domainTarget.itemId) {
        throw new Error(`Item ${itemLabel(mutation.item)} is not bound to the requested temporal-domain item.`);
      }
      const current = snapshot;
      const domain = current?.temporalDomains.find((candidate) => candidate.companion === domainTarget.companion
        && candidate.id === domainTarget.domainId);
      if (current === undefined || domain === undefined) throw new Error("Studio has no writable temporal-domain source.");
      const projected = domainGestureSpan(domain.anchors, handle, domainTarget);
      if (projected === undefined || projected.startFrame !== startFrame || projected.endFrameExclusive !== endFrameExclusive) {
        throw new Error("The temporal-domain edit does not produce the requested timeline projection.");
      }
      const absolute = resolve(options.workspaceRoot, domain.source.path);
      const source = await readFile(absolute, "utf8");
      if (domain.source.content.start < 0 || domain.source.content.end < domain.source.content.start || domain.source.content.end > source.length) {
        throw new Error("The current temporal-domain source range is invalid.");
      }
      const body = source.slice(domain.source.content.start, domain.source.content.end);
      const replacement = options.registry.adjustTemporalDomain({
        companion: domain.companion,
        sourceName: domain.source.path,
        source: body,
        adjustment: domainTarget.kind === "span"
          ? {
              kind: "span",
              itemId: domainTarget.itemId,
              startAnchorId: domainTarget.startAnchorId,
              endAnchorId: domainTarget.endAnchorId,
            }
          : { kind: "point", itemId: domainTarget.itemId, anchorId: domainTarget.anchorId },
      });
      if (replacement !== body) patches.push({
        path: relative(options.workspaceRoot, absolute), range: domain.source.content, replacement, preimage: body,
      });
    }

    const domainFrame = (endpoint: StudioTemporalInstantProjection): number | undefined => {
      if (endpoint.authority.kind !== "domain" || domainTarget === undefined || handle.domain === undefined) return undefined;
      const domain = snapshot?.temporalDomains.find((candidate) => candidate.companion === domainTarget.companion
        && candidate.id === domainTarget.domainId);
      if (domainTarget.kind === "span" && handle.domain.kind === "span") {
        const anchorId = endpoint.authority.boundary === "start"
          ? domainTarget.startAnchorId
          : domainTarget.endAnchorId;
        return domain?.anchors.find((anchor) => anchor.id === anchorId)?.frame;
      }
      if (domainTarget.kind === "point" && handle.domain.kind === "point") {
        return domain?.anchors.find((anchor) => anchor.id === domainTarget.anchorId)?.frame;
      }
      return undefined;
    };
    if (temporalEdit === undefined || handle.temporalRecord === undefined) {
      throw new Error("This timeline Item has no executed Temporal edit graph.");
    }
    const bindings = temporalAuthorBindings({
      state: temporalEdit.state,
      rootRecord: handle.temporalRecord,
      workspaceRoot: options.workspaceRoot,
      placements: temporalEdit.placements,
      files: temporalEdit.files,
    });
    const writes = planTemporalInverse({
      state: temporalEdit.state,
      rootRecord: handle.temporalRecord,
      target: temporal.kind === "instant"
        ? { kind: "instant", frame: startFrame }
        : { kind: "window", startFrame, endFrameExclusive },
      bindings,
      domainFrame,
      registry: options.registry,
      identify: (type, value) => options.registry.identifyTemporalSource(type, value),
    });
    patches.push(...writes.map((write) => ({ ...write.source, replacement: write.replacement })));
    return patches.filter((patch) => patch.replacement !== patch.preimage);
  };

  const mutationPatches = async (mutation: StudioMutation): Promise<readonly Patch[]> => {
    if (mutation.type === "timeline.adjust") return timelinePatches(mutation);
    const owner = currentParameterOwner(mutation.owner);
    const parameter = owner.inspector.find((candidate) => candidate.id === mutation.parameterId);
    if (parameter?.edit === undefined) {
      throw new Error(`${owner.label} has no writable parameter ${mutation.parameterId}.`);
    }
    const authorValue = parameterAuthorValue(parameter, mutation.value);
    if (parameter.schema !== undefined) {
      validateParameterValue(authorValue, parameter.schema, parameter.label);
    } else if (parameter.control === "boolean" && typeof mutation.value !== "boolean") {
      throw new Error(`${parameter.label} expects true or false.`);
    } else if (parameter.control === "number" && (typeof mutation.value !== "number" || !Number.isFinite(mutation.value))) {
      throw new Error(`${parameter.label} expects a number.`);
    } else if ((parameter.control === "text" || parameter.control === "color")
      && typeof mutation.value !== "string") {
      throw new Error(`${parameter.label} expects text.`);
    }
    if (parameter.options !== undefined && !parameter.options.some(option => parameterOption(option).value === authorValue)) {
      throw new Error(`${parameter.label} does not accept ${mutation.value}.`);
    }
    if (parameter.edit.attributes) {
      const replacement = serializeAttributeGroup(parameter, authorValue);
      return replacement === parameter.edit.source.preimage ? [] : [{ ...parameter.edit.source, replacement }];
    }
    const encoded = serializeParameterValue(authorValue, parameter.edit.language);
    const replacement = `${parameter.edit.source.prefix ?? ""}${encoded}${parameter.edit.source.suffix ?? ""}`;
    return replacement === parameter.edit.source.preimage ? [] : [{
      ...parameter.edit.source,
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
      const temporalMismatch = mutation.type !== "timeline.adjust" || failure?.revision === attempt
        ? undefined
        : (() => {
            const item = snapshot?.tracks.flatMap((track) => track.items)
              .find((candidate) => sameStudioItemAddress(candidate.address, mutation.item));
            if (item === undefined) return `Item ${itemLabel(mutation.item)} disappeared after recompilation.`;
            return mutation.target.kind === "instant"
              ? item.startFrame === mutation.target.frame ? undefined
                : `Item ${itemLabel(mutation.item)} resolved to frame ${item.startFrame}, not ${mutation.target.frame}.`
              : item.startFrame === mutation.target.startFrame
                  && item.endFrameExclusive === mutation.target.endFrameExclusive ? undefined
                : `Item ${itemLabel(mutation.item)} resolved to [${item.startFrame}, ${item.endFrameExclusive}), not [${mutation.target.startFrame}, ${mutation.target.endFrameExclusive}).`;
          })();
      if (failure?.revision !== attempt && temporalMismatch === undefined) {
        server?.ws.send({ type: "custom", event: "studio:snapshot", data: snapshot });
        return attempt;
      }
      const rejected = temporalMismatch ?? failure!.error;
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
      sourceWatch.replace([
        ...(options.selection.kind === "preset" ? [resolve(options.selection.source)] : []),
        resolve(currentSource),
      ]);
      value.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://studio.hypit.local");
        if (request.method === "PUT" && url.pathname === "/__studio/source") {
          if (!allowsStudioMutation(request.headers)) {
            json(response, 403, { error: "Cross-origin Studio mutations are prohibited." });
            return;
          }
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
        if (request.method === "PUT" && url.pathname === "/__studio/artifact-name") {
          if (!allowsStudioMutation(request.headers)) {
            json(response, 403, { error: "Cross-origin Studio mutations are prohibited." });
            return;
          }
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                build?: unknown; output?: unknown; displayName?: unknown;
              };
              if (typeof body.build !== "string" || typeof body.output !== "string"
                || (typeof body.displayName !== "string" && body.displayName !== null)) {
                json(response, 400, { error: "Expected Build, Output and displayName" });
                return;
              }
              if (options.buildLibrary === undefined) throw new Error("Result Repository is unavailable");
              const displayName = await options.buildLibrary.renameArtifact(body.build, body.output, body.displayName);
              json(response, 200, { displayName: displayName ?? null });
            } catch (error) {
              json(response, 422, { error: error instanceof Error ? error.message : String(error) });
            }
          })();
          return;
        }
        if (request.method === "POST" && url.pathname === "/__studio/mutation") {
          if (!allowsStudioMutation(request.headers)) {
            json(response, 403, { error: "Cross-origin Studio mutations are prohibited." });
            return;
          }
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<StudioMutation>;
              if ((body.type !== "timeline.adjust" && body.type !== "parameter.adjust")
                || typeof body.revision !== "number") {
                json(response, 400, { error: "Expected a Studio author mutation." });
                return;
              }
              const isTrackAddress = (value: unknown): value is StudioTrackAddress => typeof value === "object" && value !== null
                && typeof (value as Partial<StudioTrackAddress>).output === "string"
                && ((value as Partial<StudioTrackAddress>).attachment === undefined
                  || typeof (value as Partial<StudioTrackAddress>).attachment === "string");
              const isItemAddress = (value: unknown): value is StudioItemAddress => typeof value === "object" && value !== null
                && isTrackAddress((value as Partial<StudioItemAddress>).track)
                && typeof (value as Partial<StudioItemAddress>).item === "string";
              if (body.type === "timeline.adjust"
                && (!isItemAddress(body.item) || typeof body.gesture !== "string"
                  || typeof body.target !== "object" || body.target === null)) {
                json(response, 400, { error: "Expected a timeline gesture and target." });
                return;
              }
              if (body.type === "parameter.adjust"
                && (typeof body.parameterId !== "string" || body.value === undefined
                  || typeof body.owner !== "object" || body.owner === null
                  || (body.owner.kind === "item" && !isItemAddress(body.owner.item))
                  || (body.owner.kind === "track-object"
                    && (!isTrackAddress(body.owner.track) || typeof body.owner.objectId !== "string"))
                  || (body.owner.kind !== "item" && body.owner.kind !== "track-object"))) {
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
        if (url.pathname === "/__studio/visual.html" || url.pathname === "/__studio/document") {
          void (async () => {
            if (timer !== undefined || publishing > 0) {
              json(response, 409, { error: "Studio is compiling a Source change; capture after the updated preview is ready." });
              return;
            }
            await ensureSnapshot();
            if (failure !== undefined || visualHtml === undefined) {
              json(response, 500, failure ?? { error: "Studio has no compiled picture." });
              return;
            }
            if (url.pathname === "/__studio/document") {
              json(response, 200, visualDocument);
              return;
            }
            response.statusCode = 200;
            response.setHeader("content-type", "text/html; charset=utf-8");
            response.setHeader("cache-control", "no-store");
            response.end(request.method === "HEAD" ? undefined : visualHtml);
          })();
          return;
        }
        if (url.pathname === "/__studio/session") {
          void (async () => {
            await ensureSnapshot();
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
          const section = url.searchParams.get("section");
          if (section !== "tasks" && section !== "artifacts") {
            json(response, 400, { error: "Choose tasks or artifacts with the section parameter" });
            return;
          }
          const media = url.searchParams.get("media") ?? undefined;
          if (media !== undefined && media !== "image" && media !== "video" && media !== "audio") {
            json(response, 400, { error: "Choose image, video or audio with the media parameter" });
            return;
          }
          const before = url.searchParams.get("before") ?? undefined;
          const invocationSource = url.searchParams.get("invocationSource") ?? undefined;
          const build = url.searchParams.get("build") ?? undefined;
          void readLibrary({ section, ...(media === undefined ? {} : { media }), ...(before === undefined ? {} : { before }),
            ...(invocationSource === undefined ? {} : { invocationSource }),
            ...(build === undefined ? {} : { build }) }).then(
            (view) => json(response, 200, view),
            (error) => json(response, 500, { error: error instanceof Error ? error.message : String(error) }),
          );
          return;
        }
        if (url.pathname === "/__studio/declaration-preview") {
          void (async () => {
            const module = url.searchParams.get("module");
            const version = url.searchParams.get("version");
            const declaration = url.searchParams.get("declaration");
            const preview = module === null || version === null || declaration === null
              ? undefined
              : findDeclarationPreview(options.registry, { name: module, version }, declaration);
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
        const waveformResource = /^\/__studio\/waveform\/(res_[a-zA-Z0-9._:-]+)$/u.exec(url.pathname)?.[1];
        if (waveformResource !== undefined) {
          void (async () => {
            const file = material.get(waveformResource);
            if (file === undefined || !/^(audio|video)\//u.test(file.mediaType)) {
              response.statusCode = 404;
              response.end();
              return;
            }
            let pending = waveforms.get(waveformResource);
            if (pending === undefined) {
              pending = waveformQueue.then(() => {
                if (material.get(waveformResource) !== file) throw new Error("Studio material changed before its waveform was requested.");
                return createStudioWaveform(file);
              });
              waveformQueue = pending.catch(() => undefined);
              waveforms.set(waveformResource, pending);
            }
            const bytes = await pending;
            response.statusCode = 200;
            response.setHeader("content-type", "image/png");
            response.setHeader("cache-control", "public, max-age=31536000, immutable");
            if (request.method === "HEAD") response.end();
            else response.end(Buffer.from(bytes));
          })().catch((error) => {
            waveforms.delete(waveformResource);
            json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
          return;
        }
        const storyboardResource = /^\/__studio\/storyboard\/(res_[a-zA-Z0-9._:-]+)$/u.exec(url.pathname)?.[1];
        if (storyboardResource !== undefined) {
          void (async () => {
            const file = material.get(storyboardResource);
            if (file === undefined || !file.mediaType.startsWith("video/")) {
              response.statusCode = 404;
              response.end();
              return;
            }
            try {
              let pending = storyboards.get(storyboardResource);
              if (pending === undefined) {
                pending = storyboardQueue.then(() => {
                  if (material.get(storyboardResource) !== file) throw new Error("Studio material changed before its storyboard was requested.");
                  return createStudioStoryboard(file);
                });
                storyboardQueue = pending.catch(() => undefined);
                storyboards.set(storyboardResource, pending);
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
              storyboards.delete(storyboardResource);
              json(response, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          })();
          return;
        }
        const materialResource = /^\/__studio\/material\/(res_[a-zA-Z0-9._:-]+)$/u.exec(url.pathname)?.[1];
        if (materialResource !== undefined) {
          const file = material.get(materialResource);
          if (file === undefined) {
            response.statusCode = 404;
            response.end();
            return;
          }
          const size = file.size;
          let range: BuildResultFileRange | undefined;
          try {
            range = requestedByteRange(request.headers.range, size);
          } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            response.statusCode = 416;
            response.setHeader("content-range", `bytes */${size}`);
            response.end();
            return;
          }
          response.statusCode = range === undefined ? 200 : 206;
          response.setHeader("content-type", file.mediaType);
          response.setHeader("content-length", String(range === undefined ? size : range.endExclusive - range.start));
          response.setHeader("cache-control", "no-store");
          response.setHeader("accept-ranges", "bytes");
          if (range !== undefined) {
            response.setHeader("content-range", `bytes ${range.start}-${range.endExclusive - 1}/${size}`);
          }
          if (request.method === "HEAD") response.end();
          else void (async () => {
            await pipeline(Readable.from(await file.open(range)), response);
          })().catch((error) => {
            if (response.headersSent) response.destroy(error instanceof Error ? error : new Error(String(error)));
            else {
              response.removeHeader("content-length");
              response.removeHeader("content-range");
              json(response, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          });
          return;
        }
        if (url.pathname === "/__studio/artifact") {
          void (async () => {
            const build = url.searchParams.get("build");
            const output = url.searchParams.get("output");
            if (build === null || output === null || options.buildLibrary === undefined) {
              response.statusCode = 404;
              response.end();
              return;
            }
            const artifact = await options.buildLibrary.openArtifact(build, output);
            if (artifact === undefined) {
              response.statusCode = 404;
              response.end();
              return;
            }
            let range: BuildResultFileRange | undefined;
            try {
              range = requestedByteRange(request.headers.range, artifact.size);
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              response.statusCode = 416;
              response.setHeader("content-range", `bytes */${artifact.size}`);
              response.end();
              return;
            }
            response.statusCode = range === undefined ? 200 : 206;
            response.setHeader("content-type", artifact.mediaType);
            response.setHeader("content-length", String(range === undefined
              ? artifact.size
              : range.endExclusive - range.start));
            response.setHeader("cache-control", "private, no-store");
            response.setHeader("accept-ranges", "bytes");
            if (range !== undefined) {
              response.setHeader("content-range", `bytes ${range.start}-${range.endExclusive - 1}/${artifact.size}`);
            }
            if (request.method === "HEAD") {
              response.end();
              return;
            }
            const stream = await artifact.open(range);
            if (stream === undefined) {
              response.statusCode = 404;
              response.removeHeader("content-length");
              response.removeHeader("content-range");
              response.end();
              return;
            }
            await pipeline(Readable.from(stream), response);
          })().catch((error) => {
            if (response.headersSent) response.destroy(error instanceof Error ? error : new Error(String(error)));
            else json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
          return;
        }
        next();
      });
    },
    async closeBundle() {
      if (timer !== undefined) clearTimeout(timer);
      sourceWatch.close();
      await options.buildLibrary?.close();
    },
  };
}
