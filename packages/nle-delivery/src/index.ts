import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { audiovisualAudioContributionKind, type AudiovisualAudioContribution } from "@hypit/audiovisual-audio";
import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  audiovisualHtmlContributionKind,
  linkAudiovisualProgramToHtml,
  type AudiovisualHtmlContribution,
  type AudiovisualHtmlLink,
} from "@hypit/audiovisual-html";
import {
  createHtmlVideoDeliveryPlan,
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
  type NleLoweringHost,
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
  return project.compositions.flatMap(composition => composition.tracks.flatMap(track =>
    track.items.flatMap(item => item.kind !== "present" ? [] : item.source === "media" ? [item.asset]
      : item.source === "component" ? Object.values(item.media ?? {}) : [])));
}

function contributions<T extends object>(host: ProjectHost, kind: string): readonly T[] {
  return host.packages.contributions(kind).map(entry => {
    if (entry.value === null || typeof entry.value !== "object" || Array.isArray(entry.value)) {
      throw new Error(`Project package ${entry.package} has an invalid ${kind} contribution.`);
    }
    return { kind, package: entry.package, ...entry.value } as T;
  });
}

export type PreparedNleDelivery = {
  readonly project: NleProject;
  readonly link: NleDeliveryTerminalLink;
  readonly plan: HtmlVideoDeliveryPlan;
};

export type NleDeliveryTerminalLink = {
  readonly project: NleProject;
  readonly program: AudiovisualProgram;
  readonly picture: AudiovisualHtmlLink;
  readonly audioContributions: readonly AudiovisualAudioContribution[];
};

function linkNleDelivery(input: {
  readonly project: NleProject;
  readonly lowering: NleLoweringHost;
  readonly html: readonly AudiovisualHtmlContribution[];
  readonly audio: readonly AudiovisualAudioContribution[];
}): NleDeliveryTerminalLink {
  const program = lowerNleProjectToAudiovisual(input.project, input.lowering);
  return {
    project: structuredClone(input.project),
    program,
    picture: linkAudiovisualProgramToHtml(program, input.html),
    audioContributions: input.audio,
  };
}

export async function prepareNleDelivery(input: {
  readonly host: ProjectHost;
  readonly document: string;
  readonly profile: HtmlVideoDeliveryProfile;
}): Promise<PreparedNleDelivery> {
  const document = projectPath(input.host.boundary.root, input.document, "NLE delivery document");
  const project = readNleProject(await readFile(document, "utf8"));
  const resolver = createNodeProjectResourceResolver(input.host.boundary.root);
  const resolved = new Map<string, ResolvedMedia>();
  for (const reference of mediaReferences(project)) {
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
  const link = linkNleDelivery({
    project,
    lowering,
    html: contributions<AudiovisualHtmlContribution>(input.host, audiovisualHtmlContributionKind),
    audio: contributions<AudiovisualAudioContribution>(input.host, audiovisualAudioContributionKind),
  });
  return { project, link, plan: createHtmlVideoDeliveryPlan(link, input.profile) };
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
      const prepared = await prepareNleDelivery({ host: this.#host, document: request.document, profile: request.profile });
      action.abort.signal.throwIfAborted();
      this.#publish(action, { handle, state: "running", progress: 0.05 });
      const result = await this.#executor.execute(prepared.plan, {
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
