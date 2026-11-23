import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AudioProgram } from "@hypit/audio-program";
import type { HtmlCanvas, HtmlFrameRate, HtmlFrameRequest } from "@hypit/html-program";
import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";
import { compileAudio } from "./compiler/compile-audio.js";
import { compilePicture } from "./compiler/compile-picture.js";
import { lowerNleComponentPicture, lowerNleProject } from "./compiler/lower.js";
import { createNleRenderResolver } from "./compiler/resolve.js";
import { createProjectFontResolver } from "./project-fonts.js";
export { assertNleTextFragment, assertNleTextTypography, nleTextFragment, readNleTextFontSource } from "./text.js";
export type { NleTextNode, NleTextTypography, ResolveNleTextFont } from "./text.js";
import { nleRenderContributionKind, type NleRenderContribution } from "./render-contribution.js";
export { nleRenderContributionKind } from "./render-contribution.js";
export type {
  NleAudioEffect, NleComponentPicture, NleComponentRenderContext, NleMatteRenderContext,
  NlePictureEffect, NlePictureReconstructionContext, NleProcessRenderContext, NleRenderContribution,
  NleRenderContext, NleTransitionRenderContext,
} from "./render-contribution.js";
import {
  type HtmlVideoDeliveryPlan,
  type HtmlVideoDeliveryProfile,
  type HtmlVideoExecutor,
  type HtmlVideoRenderer,
} from "@hypit/html-video";
import {
  readNleProject,
  type NleMediaReference,
  type NleProject,
} from "@hypit/nle";
import type { MediaResource, ResolvedMedia } from "@hypit/media";
import type { ProjectHost } from "@hypit/project";
import { createNodeProjectResourceResolver, prepareNodeProjectFile, resolveNodeProjectFile } from "@hypit/project/node";

function portable(path: string): string { return path.split(sep).join("/"); }

function projectReference(root: string, document: string, reference: NleMediaReference): { readonly path: string } {
  const absolute = resolve(dirname(document), reference.path);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`NLE Media reference ${reference.path} leaves the Project Boundary.`);
  }
  return { path: portable(local) };
}

type CompositionOutputs = { readonly picture: boolean; readonly audio: boolean };

function mediaReferences(project: NleProject, entry: string, outputs: CompositionOutputs): readonly NleMediaReference[] {
  const compositions = new Map(project.compositions.map(value => [value.id, value] as const));
  const visited = new Set<string>();
  const references: NleMediaReference[] = [];
  const visit = (id: string, { picture, audio }: CompositionOutputs) => {
    const key = JSON.stringify([id, picture, audio]);
    if (visited.has(key)) return;
    visited.add(key);
    const composition = compositions.get(id)!;
    const matteSources = new Set(composition.mattes.map(relation => relation.matte));
    for (const track of composition.tracks) for (const item of track.items) {
      if (item.kind !== "present") continue;
      const isMatte = matteSources.has(item.id);
      const needsPicture = picture && item.picture !== undefined && ((track.enabled && item.enabled) || isMatte);
      const needsAudio = audio && item.audio !== undefined && track.enabled && item.enabled;
      if (!needsPicture && !needsAudio) continue;
      if (item.source === "media") references.push(item.asset);
      else if (item.source === "component") references.push(...Object.values(item.media ?? {}));
      else visit(item.composition, { picture: needsPicture, audio: needsAudio });
    }
  };
  visit(entry, outputs);
  return references;
}

export type PreparedNleCompilation = {
  readonly duration: ExactTemporalValue;
  compilePicture(output: { readonly canvas: HtmlCanvas; readonly frameRate: HtmlFrameRate;
    readonly frames?: readonly number[] }): HtmlFrameRequest["program"];
  compileFrame(output: { readonly canvas: HtmlCanvas; readonly frameRate: HtmlFrameRate; readonly range: TemporalRange }): HtmlFrameRequest;
  compileAudio(profile?: HtmlVideoDeliveryProfile["audio"]): AudioProgram | undefined;
  compileVideo(profile: HtmlVideoDeliveryProfile, range?: TemporalRange): HtmlVideoDeliveryPlan;
};

type NleCompilationInput = {
  readonly host: ProjectHost;
  readonly document: string;
  readonly snapshot?: NleProject;
  readonly composition?: string;
  readonly pictureOnly?: boolean;
  readonly signal?: AbortSignal;
};

async function readCompilationProject(input: NleCompilationInput) {
  input.signal?.throwIfAborted();
  const { address: document } = await resolveNodeProjectFile(input.host.boundary.root, input.document, "NLE delivery document");
  const project = input.snapshot === undefined ? readNleProject(await readFile(document, "utf8")) : structuredClone(input.snapshot);
  return { project, document };
}

async function prepareRenderResolver(input: NleCompilationInput, document: string, references: readonly NleMediaReference[]) {
  const resolver = createNodeProjectResourceResolver(input.host.boundary.root);
  const resolved = new Map<string, ResolvedMedia>();
  for (const reference of references) {
    input.signal?.throwIfAborted();
    if (!resolved.has(reference.path)) resolved.set(reference.path, await input.host.media.resolveMedia(
      projectReference(input.host.boundary.root, document, reference), resolver));
  }
  const contributions = input.host.packages.contributions(nleRenderContributionKind).map(entry => {
    if (entry.value === null || typeof entry.value !== "object" || Array.isArray(entry.value)) {
      throw new Error(`Project package ${entry.package} has an invalid NLE render contribution.`);
    }
    return { package: entry.package, value: entry.value as NleRenderContribution };
  });
  input.signal?.throwIfAborted();
  return createNleRenderResolver(contributions, reference => {
    const value = resolved.get(reference.path);
    if (value === undefined) throw new Error(`NLE delivery did not resolve Media ${reference.path}.`);
    return structuredClone(value);
  }, createProjectFontResolver(input.host.boundary.root));
}

export async function prepareNleComponentPicture(input: NleCompilationInput & {
  readonly composition: string;
  readonly item: string;
}): Promise<{ readonly region: { readonly width: number; readonly height: number };
  readonly constant: boolean; readonly compilePicture: PreparedNleCompilation["compilePicture"] }> {
  const { project, document } = await readCompilationProject(input);
  const composition = project.compositions.find(value => value.id === input.composition);
  const track = composition?.tracks.find(value => value.items.some(item => item.id === input.item));
  const item = track?.items.find(value => value.id === input.item);
  if (composition === undefined || track === undefined || item?.kind !== "present" || item.source !== "component"
    || item.picture === undefined) throw new Error(`NLE Composition ${input.composition} has no Picture Component ${input.item}.`);
  const resolver = await prepareRenderResolver(input, document, Object.values(item.media ?? {}));
  const program = lowerNleComponentPicture(project, composition, track, item, resolver);
  const occurrence = program.occurrences[item.id]!;
  return {
    region: program.pictureDomain!.region,
    constant: occurrence.picture?.kind === "constant" && occurrence.content.kind === "visual"
      && occurrence.content.visual.setup === undefined,
    compilePicture: output => compilePicture(program, output),
  };
}

async function prepareCompositionGraph(input: NleCompilationInput, outputs: CompositionOutputs) {
  const { project, document } = await readCompilationProject(input);
  const selected = input.composition ?? project.rootComposition;
  const composition = project.compositions.find(value => value.id === selected);
  if (composition === undefined) {
    throw new Error(`NLE Project ${project.id} has no Composition ${selected}.`);
  }
  const resolver = await prepareRenderResolver(input, document, mediaReferences(project, selected, outputs));
  return lowerNleProject(project, resolver, composition, outputs);
}

/** Compile a Composition's mix independently of its Picture programme. */
export async function prepareNleCompositionAudio(input: Omit<NleCompilationInput, "pictureOnly"> & {
  readonly profile: NonNullable<HtmlVideoDeliveryProfile["audio"]>;
}): Promise<AudioProgram | undefined> {
  const program = await prepareCompositionGraph(input, { picture: false, audio: true });
  return program.audio === undefined ? undefined : compileAudio({ program, ...input.profile });
}

export async function prepareNleCompilation(input: NleCompilationInput): Promise<PreparedNleCompilation> {
  const program = await prepareCompositionGraph(input, { picture: true, audio: input.pictureOnly !== true });
  function audioProgram(profile?: HtmlVideoDeliveryProfile["audio"]): AudioProgram | undefined {
    return program.audio === undefined ? undefined : compileAudio({
      program,
      sampleRate: profile?.sampleRate ?? 48_000,
      channels: profile?.channels ?? 2,
    });
  }
  return {
    duration: structuredClone(program.domain.duration),
    compilePicture(output) {
      return compilePicture(program, output);
    },
    compileFrame(output) {
      return {
        program: compilePicture(program, output),
        frames: [0],
        picture: { alpha: "opaque", matte: output.canvas.background },
      };
    },
    compileAudio: audioProgram,
    compileVideo(profile, range) {
      const { width, height, background, frameRate, quality } = profile.picture;
      const visual = compilePicture(program, {
        frameRate, canvas: { width, height, background }, ...(range === undefined ? {} : { range }),
      });
      const audio = audioProgram(profile.audio);
      return {
        visual: { program: visual, picture: { alpha: "opaque", matte: background }, quality },
        ...(audio === undefined ? {} : { audio }),
        ...(range === undefined ? {} : { range }),
      };
    },
  };
}

export async function prepareNleDelivery(input: {
  readonly host: ProjectHost;
  readonly document: string;
  readonly profile: HtmlVideoDeliveryProfile;
  readonly snapshot?: NleProject;
  readonly signal?: AbortSignal;
}): Promise<HtmlVideoDeliveryPlan> {
  const compilation = await prepareNleCompilation(input);
  return compilation.compileVideo(input.profile);
}

export type NleDeliveryActionHandle = string;
type ObservationBase = { readonly handle: string; readonly progress: number };
export type NleDeliveryActionObservation =
  | (ObservationBase & { readonly state: "queued" | "running" })
  | (ObservationBase & { readonly state: "complete"; readonly result: MediaResource })
  | (ObservationBase & { readonly state: "failed"; readonly diagnostic: string })
  | (ObservationBase & { readonly state: "cancelled" });
export type NleDeliveryActionListener = (observation: NleDeliveryActionObservation) => void;

export type NleDeliveryRequest = {
  readonly document: string;
  readonly destination: string;
  readonly profile: HtmlVideoDeliveryProfile;
  readonly renderer?: HtmlVideoRenderer;
  readonly snapshot?: NleProject;
};

export interface NleDeliveryService {
  start(request: NleDeliveryRequest): Promise<NleDeliveryActionHandle>;
  observe(handle: NleDeliveryActionHandle): NleDeliveryActionObservation;
  subscribe(handle: NleDeliveryActionHandle, listener: NleDeliveryActionListener): () => void;
  cancel(handle: NleDeliveryActionHandle): NleDeliveryActionObservation;
  close(): void;
}

type Action = {
  observation: NleDeliveryActionObservation;
  readonly abort: AbortController;
  readonly listeners: Set<NleDeliveryActionListener>;
};

class ProjectNleDeliveryService implements NleDeliveryService {
  readonly #host: ProjectHost;
  readonly #executor: HtmlVideoExecutor;
  readonly #actions = new Map<string, Action>();
  #closed = false;

  constructor(host: ProjectHost, executor: HtmlVideoExecutor) {
    this.#host = host;
    this.#executor = executor;
  }

  async start(request: NleDeliveryRequest): Promise<string> {
    if (this.#closed) throw new Error("NLE Delivery Service is closed.");
    const root = this.#host.boundary.root;
    const { path: document } = await resolveNodeProjectFile(root, request.document, "NLE delivery document");
    const { address: destination } = await prepareNodeProjectFile(root, request.destination, {
      label: "NLE delivery destination", createDirectories: true,
    });
    if (this.#closed) throw new Error("NLE Delivery Service is closed.");
    const handle = randomUUID();
    const action: Action = {
      observation: { handle, state: "queued", progress: 0 },
      abort: new AbortController(),
      listeners: new Set(),
    };
    this.#actions.set(handle, action);
    void this.#run(action, { ...request, document }, destination);
    return handle;
  }

  observe(handle: string): NleDeliveryActionObservation {
    const action = this.#require(handle);
    return structuredClone(action.observation);
  }

  subscribe(handle: string, listener: NleDeliveryActionListener): () => void {
    const action = this.#require(handle);
    action.listeners.add(listener);
    listener(structuredClone(action.observation));
    return () => action.listeners.delete(listener);
  }

  cancel(handle: string): NleDeliveryActionObservation {
    const action = this.#require(handle);
    if (action.observation.state === "queued" || action.observation.state === "running") action.abort.abort();
    return structuredClone(action.observation);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const action of this.#actions.values()) {
      if (action.observation.state === "queued" || action.observation.state === "running") action.abort.abort();
    }
  }

  #require(handle: string): Action {
    const action = this.#actions.get(handle);
    if (action === undefined) throw new Error(`Unknown NLE Delivery Action ${handle}.`);
    return action;
  }

  #publish(action: Action, observation: NleDeliveryActionObservation): void {
    action.observation = observation;
    for (const listener of action.listeners) listener(structuredClone(observation));
  }

  async #run(action: Action, request: NleDeliveryRequest, destination: string): Promise<void> {
    const handle = action.observation.handle;
    try {
      this.#publish(action, { handle, state: "running", progress: 0 });
      const plan = await prepareNleDelivery({
        host: this.#host, document: request.document, profile: request.profile, signal: action.abort.signal,
        ...(request.snapshot === undefined ? {} : { snapshot: request.snapshot }),
      });
      action.abort.signal.throwIfAborted();
      this.#publish(action, { handle, state: "running", progress: 0.05 });
      const result = await this.#executor.execute(plan, {
        destination,
        renderer: request.renderer ?? request.profile.picture.renderer ?? "chromium",
        signal: action.abort.signal,
        onProgress: progress => {
          const amount = progress.total === 0 ? 0 : progress.completed / progress.total;
          const value = progress.phase === "visual" ? 0.05 + amount * 0.85
            : progress.phase === "audio" ? 0.1 + amount * 0.1
            : 0.9 + amount * 0.1;
          if (action.observation.state === "running") {
            this.#publish(action, { handle, state: "running", progress: Math.max(action.observation.progress, value) });
          }
        },
      });
      this.#publish(action, { handle, state: "complete", progress: 1, result });
    } catch (error) {
      this.#publish(action, action.abort.signal.aborted
        ? { handle, state: "cancelled", progress: action.observation.progress }
        : { handle, state: "failed", progress: action.observation.progress,
          diagnostic: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function openNleDeliveryService(input: {
  readonly host: ProjectHost;
  readonly executor: HtmlVideoExecutor;
}): NleDeliveryService {
  return new ProjectNleDeliveryService(input.host, input.executor);
}
