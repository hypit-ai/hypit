import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { audiovisualAudioContributionKind, lowerAudiovisualAudioProgram, type AudiovisualAudioContribution } from "@hypit/audiovisual-audio";
import type { AudioProgram } from "@hypit/audio-program";
import type { HtmlCanvas, HtmlFrameRate, HtmlFrameRequest } from "@hypit/html-program";
import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";
import {
  audiovisualHtmlContributionKind,
  linkAudiovisualProgramToHtml,
  type AudiovisualHtmlContribution,
  lowerAudiovisualPictureToHtmlProgram,
} from "@hypit/audiovisual-html";
import {
  type HtmlVideoDeliveryPlan,
  type HtmlVideoDeliveryProfile,
  type HtmlVideoExecutor,
  type HtmlVideoRenderer,
} from "@hypit/html-video";
import {
  createNlePackageLoweringHost,
  lowerNleProjectToAudiovisual,
  nleLoweringContributionKind,
  readNleProject,
  type NleLoweringContribution,
  type NleMediaReference,
  type NleProject,
} from "@hypit/nle";
import type { MediaResource, ResolvedMedia } from "@hypit/media";
import type { ProjectHost } from "@hypit/project";
import { createNodeProjectResourceResolver } from "@hypit/project/node";

function portable(path: string): string { return path.split(sep).join("/"); }

function projectPath(root: string, value: string, subject: string): string {
  if (value.length === 0 || isAbsolute(value)) throw new Error(`${subject} must be a portable Project path.`);
  const absolute = resolve(root, value);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${subject} leaves the Project Boundary.`);
  }
  return absolute;
}

function projectReference(root: string, document: string, reference: NleMediaReference): { readonly path: string } {
  const absolute = resolve(dirname(document), reference.path);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`NLE Media reference ${reference.path} leaves the Project Boundary.`);
  }
  return { path: portable(local) };
}

function mediaReferences(project: NleProject): readonly NleMediaReference[] {
  const compositions = new Map(project.compositions.map(value => [value.id, value] as const));
  const visited = new Set<string>();
  const references: NleMediaReference[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const track of compositions.get(id)!.tracks) for (const item of track.items) {
      if (item.kind !== "present" || !item.enabled) continue;
      if (item.source === "media") references.push(item.asset);
      else if (item.source === "component") references.push(...Object.values(item.media ?? {}));
      else visit(item.composition);
    }
  };
  visit(project.rootComposition);
  return references;
}

function contributions<T extends object>(host: ProjectHost, kind: string): readonly T[] {
  return host.packages.contributions(kind).map(entry => {
    if (entry.value === null || typeof entry.value !== "object" || Array.isArray(entry.value)) {
      throw new Error(`Project package ${entry.package} has an invalid ${kind} contribution.`);
    }
    return { kind, package: entry.package, ...entry.value } as T;
  });
}

export type PreparedNleCompilation = {
  readonly duration: ExactTemporalValue;
  compileFrame(output: { readonly canvas: HtmlCanvas; readonly frameRate: HtmlFrameRate; readonly range: TemporalRange }): HtmlFrameRequest;
  compileAudio(profile?: HtmlVideoDeliveryProfile["audio"]): AudioProgram | undefined;
  compileVideo(profile: HtmlVideoDeliveryProfile, range?: TemporalRange): HtmlVideoDeliveryPlan;
};

export async function prepareNleCompilation(input: {
  readonly host: ProjectHost;
  readonly document: string;
  readonly snapshot?: NleProject;
  readonly composition?: string;
  readonly signal?: AbortSignal;
}): Promise<PreparedNleCompilation> {
  input.signal?.throwIfAborted();
  const document = projectPath(input.host.boundary.root, input.document, "NLE delivery document");
  const selected = input.snapshot === undefined ? readNleProject(await readFile(document, "utf8")) : structuredClone(input.snapshot);
  const project = input.composition === undefined ? selected : { ...selected, rootComposition: input.composition };
  if (!project.compositions.some(composition => composition.id === project.rootComposition)) {
    throw new Error(`NLE Project ${project.id} has no Composition ${project.rootComposition}.`);
  }
  const resolver = createNodeProjectResourceResolver(input.host.boundary.root);
  const resolved = new Map<string, ResolvedMedia>();
  for (const reference of mediaReferences(project)) {
    input.signal?.throwIfAborted();
    if (!resolved.has(reference.path)) resolved.set(reference.path, await input.host.media.resolveMedia(
      projectReference(input.host.boundary.root, document, reference), resolver));
  }
  const lowering = createNlePackageLoweringHost({
    contributions: contributions<NleLoweringContribution>(input.host, nleLoweringContributionKind),
    resolveMedia(reference) {
      const value = resolved.get(reference.path);
      if (value === undefined) throw new Error(`NLE delivery did not resolve Media ${reference.path}.`);
      return structuredClone(value);
    },
  });
  input.signal?.throwIfAborted();
  const program = lowerNleProjectToAudiovisual(project, lowering);
  const picture = linkAudiovisualProgramToHtml(
    program, contributions<AudiovisualHtmlContribution>(input.host, audiovisualHtmlContributionKind),
  );
  const audioContributions = contributions<AudiovisualAudioContribution>(input.host, audiovisualAudioContributionKind);
  function compileAudio(profile?: HtmlVideoDeliveryProfile["audio"]): AudioProgram | undefined {
    return program.audio === undefined ? undefined : lowerAudiovisualAudioProgram({
      program,
      contributions: audioContributions,
      sampleRate: profile?.sampleRate ?? 48_000,
      channels: profile?.channels ?? 2,
    });
  }
  return {
    duration: structuredClone(program.domain.duration),
    compileFrame(output) {
      return {
        program: lowerAudiovisualPictureToHtmlProgram(picture, output),
        frames: [0],
        picture: { alpha: "opaque", matte: output.canvas.background },
      };
    },
    compileAudio,
    compileVideo(profile, range) {
      const { width, height, background, frameRate, quality } = profile.picture;
      const visual = lowerAudiovisualPictureToHtmlProgram(picture, {
        frameRate, canvas: { width, height, background }, ...(range === undefined ? {} : { range }),
      });
      const audio = compileAudio(profile.audio);
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
    projectPath(this.#host.boundary.root, request.document, "NLE delivery document");
    const destination = projectPath(this.#host.boundary.root, request.destination, "NLE delivery destination");
    const handle = randomUUID();
    const action: Action = {
      observation: { handle, state: "queued", progress: 0 },
      abort: new AbortController(),
      listeners: new Set(),
    };
    this.#actions.set(handle, action);
    void this.#run(action, request, destination);
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
