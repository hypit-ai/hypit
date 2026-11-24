import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HtmlFrameExecutor, HtmlVideoExecutor } from "@hypit/html-video";
import type { MediaResource } from "@hypit/media";
import { renderAudioProgramWaveformLocally, type LocalMediaToolchainOptions } from "@hypit/media-local";
import type { NleProject } from "@hypit/nle";
import { prepareNleCompilation, type PreparedNleCompilation } from "@hypit/nle-delivery";
import type { ProjectHost } from "@hypit/project";
import { compareExactTemporalValues, type TemporalRate } from "@hypit/temporal/algebra";
import type { NleStudioActionObservation, NleStudioActionRequest } from "./protocol.js";
import { studioFrameTime } from "./timeline-time.js";
import { previewCanvas } from "./programme.js";

type PreviewRequest = Extract<NleStudioActionRequest, { kind: "frame-preview" | "playback-preview" | "programme-waveform" }>;
type PreviewChannel = "visual" | "waveform";
type PreviewAction = {
  readonly handle: string;
  readonly kind: PreviewRequest["kind"];
  readonly abort: AbortController;
  observation: NleStudioActionObservation;
  directory?: string;
  resource?: MediaResource;
  task?: Promise<void>;
};

export class NleStudioPreview {
  readonly #host: ProjectHost;
  readonly #document: string;
  readonly #frame: HtmlFrameExecutor;
  readonly #video: HtmlVideoExecutor | undefined;
  readonly #mediaTools: LocalMediaToolchainOptions | undefined;
  readonly #publish: (observation: NleStudioActionObservation) => void;
  readonly #cleanup = new Set<Promise<void>>();
  #generation = 0;
  readonly #current = new Map<PreviewChannel, PreviewAction>();
  #prepared: { readonly key: string; readonly abort: AbortController; readonly compilation: Promise<PreparedNleCompilation> } | undefined;

  constructor(input: {
    readonly host: ProjectHost;
    readonly document: string;
    readonly frame: HtmlFrameExecutor;
    readonly video?: HtmlVideoExecutor;
    readonly mediaTools?: LocalMediaToolchainOptions;
    readonly publish: (observation: NleStudioActionObservation) => void;
  }) {
    this.#host = input.host;
    this.#document = input.document;
    this.#frame = input.frame;
    this.#video = input.video;
    this.#mediaTools = input.mediaTools;
    this.#publish = input.publish;
  }

  get playback(): boolean { return this.#video !== undefined; }
  get waveform(): boolean { return this.#mediaTools !== undefined; }
  get generation(): number { return this.#generation; }

  #release(channel: PreviewChannel): void {
    const previous = this.#current.get(channel);
    this.#current.delete(channel);
    if (previous === undefined) return;
    previous.abort.abort();
    const cleanup = (async () => {
      await previous.task;
      if (previous.directory !== undefined) await rm(previous.directory, { recursive: true, force: true });
    })();
    this.#cleanup.add(cleanup);
    void cleanup.finally(() => this.#cleanup.delete(cleanup)).catch(() => undefined);
  }

  invalidate(): void {
    this.#generation += 1;
    this.#prepared?.abort.abort();
    this.#prepared = undefined;
    for (const channel of this.#current.keys()) this.#release(channel);
  }

  async close(): Promise<void> {
    this.invalidate();
    await Promise.allSettled(this.#cleanup);
  }

  observe(handle: string): NleStudioActionObservation | undefined {
    const action = this.#find(handle);
    return action === undefined ? undefined : structuredClone(action.observation);
  }

  resource(handle: string): MediaResource | undefined {
    const action = this.#find(handle);
    return action?.observation.state === "complete" ? action.resource : undefined;
  }

  #find(handle: string): PreviewAction | undefined {
    return [...this.#current.values()].find(action => action.handle === handle);
  }

  cancel(handle: string): NleStudioActionObservation | undefined {
    const action = this.#find(handle);
    if (action === undefined) return undefined;
    if (action.observation.state === "queued" || action.observation.state === "running") action.abort.abort();
    return structuredClone(action.observation);
  }

  start(request: PreviewRequest, project: NleProject, rate: TemporalRate): NleStudioActionObservation {
    if (request.kind === "playback-preview" && this.#video === undefined) throw new Error("NLE Studio playback preview is unavailable.");
    if (request.kind === "programme-waveform" && !this.waveform) throw new Error("NLE Studio Programme waveform is unavailable.");
    const frames = request.kind === "frame-preview" ? 1 : request.durationFrames;
    const fps = rate.numerator / rate.denominator;
    const maximum = request.kind === "frame-preview" ? 1 : request.kind === "programme-waveform"
      ? Math.max(1, Math.floor(120 * fps)) : Math.min(240, Math.max(1, Math.floor(6 * fps)));
    if (!Number.isSafeInteger(frames) || frames < 1 || frames > maximum
      || !Number.isSafeInteger(request.atFrame) || request.atFrame < 0 || !Number.isSafeInteger(request.atFrame + frames)) {
      throw new Error(`NLE Studio preview requires a frame and a range of 1 to ${maximum} frames.`);
    }
    const channel = request.kind === "programme-waveform" ? "waveform" : "visual";
    this.#release(channel);
    const released = Promise.allSettled(this.#cleanup);
    const handle = randomUUID();
    const action: PreviewAction = {
      handle, kind: request.kind, abort: new AbortController(),
      observation: { handle, kind: request.kind, state: "queued", progress: 0 },
    };
    this.#current.set(channel, action);
    this.#publish(action.observation);
    action.task = this.#run(action, request, project, rate, frames, released);
    return structuredClone(action.observation);
  }

  #prepareCompilation(request: PreviewRequest, project: NleProject): Promise<PreparedNleCompilation> {
    const key = `${request.expectedProjectRevision}:${request.composition}`;
    if (this.#prepared?.key === key) return this.#prepared.compilation;
    this.#prepared?.abort.abort();
    const abort = new AbortController();
    const compilation = prepareNleCompilation({
      host: this.#host, document: this.#document, snapshot: project, composition: request.composition, signal: abort.signal,
    }).catch((error: unknown) => {
      if (this.#prepared?.abort === abort) this.#prepared = undefined;
      throw error;
    });
    this.#prepared = { key, abort, compilation };
    return compilation;
  }

  async #run(
    action: PreviewAction, request: PreviewRequest, project: NleProject, rate: TemporalRate, frames: number,
    previous: Promise<unknown>,
  ) {
    const { handle, kind } = action;
    const signal = AbortSignal.any([action.abort.signal, AbortSignal.timeout(90_000)]);
    const update = (observation: NleStudioActionObservation) => {
      action.observation = observation;
      this.#publish(observation);
    };
    const progress = (value: number) => update({ handle, kind, state: "running", progress: value });
    try {
      await previous;
      signal.throwIfAborted();
      progress(0);
      const compilation = await this.#prepareCompilation(request, project);
      signal.throwIfAborted();
      const start = studioFrameTime(request.atFrame, rate);
      const desired = studioFrameTime(request.atFrame + frames, rate);
      const duration = compilation.duration;
      if (compareExactTemporalValues(start, duration) >= 0) throw new Error("NLE Studio preview frame is outside the Programme.");
      const range = { start, end: compareExactTemporalValues(desired, duration) > 0 ? duration : desired };
      const source = project.compositions.find(value => value.id === request.composition)!.canvas;
      const canvas = previewCanvas(source);
      action.directory = await mkdtemp(join(tmpdir(), "hypit-nle-preview-"));
      signal.throwIfAborted();
      progress(0.1);
      let frameCount: number | undefined;
      if (request.kind === "programme-waveform") {
        const audio = compilation.compileAudio();
        if (audio === undefined) throw new Error("NLE Programme has no Audio output.");
        const bytes = await renderAudioProgramWaveformLocally({
          program: audio, range, width: request.width ?? 1024, height: request.height ?? 96,
          tools: this.#mediaTools!, signal,
        });
        const address = join(action.directory, "waveform.png");
        await writeFile(address, bytes, { signal });
        action.resource = { address, mediaType: "image/png", size: bytes.byteLength };
      } else if (request.kind === "frame-preview") {
        frameCount = 1;
        const request = compilation.compileFrame({ canvas, frameRate: rate, range });
        const bytes = await this.#frame.capture(request, signal);
        signal.throwIfAborted();
        const address = join(action.directory, "frame.png");
        await writeFile(address, bytes, { signal });
        action.resource = { address, mediaType: "image/png", size: bytes.byteLength };
      } else {
        const plan = compilation.compileVideo({ picture: { ...canvas, frameRate: rate, quality: "draft" } }, range);
        frameCount = plan.visual.program.frameCount;
        action.resource = await this.#video!.execute(plan, {
          destination: join(action.directory, "playback.mp4"), renderer: "chromium", signal,
          onProgress: value => {
            if (value.phase === "visual" && value.total > 0 && !signal.aborted) progress(0.1 + 0.8 * value.completed / value.total);
          },
        });
      }
      signal.throwIfAborted();
      update({ handle, kind, state: "complete", progress: 1, result: {
        resource: `api/resources/${encodeURIComponent(handle)}`, mediaType: action.resource.mediaType,
        ...(frameCount === undefined ? {} : { frameCount }),
      } });
    } catch (error) {
      if (action.directory !== undefined) await rm(action.directory, { recursive: true, force: true }).catch(() => undefined);
      delete action.resource;
      update(action.abort.signal.aborted
        ? { handle, kind, state: "cancelled", progress: action.observation.progress }
        : { handle, kind, state: "failed", progress: action.observation.progress,
          diagnostic: error instanceof Error ? error.message : String(error) });
    }
  }
}
