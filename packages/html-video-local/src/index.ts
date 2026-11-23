import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { addAbortSignal } from "node:stream";
import { buffer } from "node:stream/consumers";
import { chromiumHtmlBackend } from "@hypit/html-chromium-local";
import { electronHtmlBackend } from "@hypit/html-electron-local";
import { captureHtmlFramesLocally, createHtmlSourceFrameIndexReader, createPreparedSourceFrames, openHtmlFrameCaptureLocally,
  renderHtmlVisualLocally, type HtmlCaptureBackend } from "@hypit/html-render-local";
import type {
  HtmlVideoExecutionOptions,
  HtmlVideoExecutor,
  HtmlVideoDeliveryPlan,
  HtmlFrameExecutor,
  HtmlFrameCapture,
  HtmlSourceFrames,
} from "@hypit/html-video";
import {
  inspectLocalMediaToolchain,
  muxLocalVideo,
  renderAudioProgramLocally,
  resolveLocalMediaToolchain,
  type LocalMediaToolchain,
  type LocalMediaToolchainOptions,
} from "@hypit/media-local";
import type { MediaResource } from "@hypit/media";

export type LocalHtmlVideoTools = LocalMediaToolchainOptions & {
  readonly chromePath?: string;
  readonly electronPath?: string;
};

class LocalHtmlVideoExecutor implements HtmlVideoExecutor, HtmlFrameExecutor {
  readonly #media: LocalMediaToolchain;
  #mediaReady: Promise<void> | undefined;
  readonly #chromium: HtmlCaptureBackend;
  readonly #electron: HtmlCaptureBackend | undefined;
  readonly #indexVideoFrames = createHtmlSourceFrameIndexReader();

  constructor(tools: LocalHtmlVideoTools) {
    this.#media = resolveLocalMediaToolchain(tools);
    this.#chromium = chromiumHtmlBackend(tools.chromePath);
    this.#electron = tools.electronPath === undefined ? undefined : electronHtmlBackend(tools.electronPath);
  }

  async #checkMedia(): Promise<void> {
    this.#mediaReady ??= inspectLocalMediaToolchain(this.#media).then((inspection) => {
      if (inspection.state !== "ready") {
        throw new Error(`Local Media toolchain is ${inspection.state}: ${inspection.diagnostic} Install compatible FFmpeg and FFprobe executables or configure their explicit paths.`);
      }
    });
    await this.#mediaReady;
  }

  async capture(request: Parameters<HtmlFrameExecutor["capture"]>[0], signal?: AbortSignal): Promise<Uint8Array> {
    if (request.frames.length !== 1) throw new Error("HTML capture requires one frame.");
    const [frame] = await this.captureFrames(request, signal);
    return frame!;
  }

  async captureFrames(request: Parameters<HtmlFrameExecutor["capture"]>[0], signal?: AbortSignal): Promise<readonly Uint8Array[]> {
    if (request.program.videoSources.length > 0) await this.#checkMedia();
    return await captureHtmlFramesLocally({
      backend: this.#chromium, request, options: {
        ffmpegPath: this.#media.ffmpegPath, ffprobePath: this.#media.ffprobePath,
        indexVideoFrames: this.#indexVideoFrames,
        ...(signal === undefined ? {} : { signal }),
      },
    });
  }

  async openCapture(request: Parameters<NonNullable<HtmlFrameExecutor["openCapture"]>>[0], signal?: AbortSignal): Promise<HtmlFrameCapture> {
    if (request.program.videoSources.length > 0) await this.#checkMedia();
    return await openHtmlFrameCaptureLocally({ backend: this.#chromium, request, options: {
      ffmpegPath: this.#media.ffmpegPath, ffprobePath: this.#media.ffprobePath, indexVideoFrames: this.#indexVideoFrames,
      maxDecodedSourceBytes: 64 * 1024 * 1024, ...(signal === undefined ? {} : { signal }),
    } });
  }

  async openSourceFrames(program: Parameters<NonNullable<HtmlFrameExecutor["openSourceFrames"]>>[0],
    signal: AbortSignal): Promise<HtmlSourceFrames> {
    signal.throwIfAborted();
    await this.#checkMedia();
    const directory = await mkdtemp(join(tmpdir(), "hypit-preview-sources-"));
    try {
      const frames = await createPreparedSourceFrames({
        program, directory, signal, lazy: true,
        selection: [{ startFrame: 0, endFrameExclusive: program.frameCount }],
        artifactPaths: new Map(program.videoSources.map(({ resource }) => [resource.address, resource.address])),
        ffmpegPath: this.#media.ffmpegPath, ffprobePath: this.#media.ffprobePath, maxBytes: 128 * 1024 * 1024,
        indexVideoFrames: this.#indexVideoFrames,
      });
      return {
        read: async (source, frame, requestSignal) => {
          const value = await frames.read(source, frame, requestSignal);
          const readSignal = requestSignal === undefined ? signal : AbortSignal.any([signal, requestSignal]);
          try { return await buffer(addAbortSignal(readSignal, value.stream)); }
          finally { await value.release(); }
        },
        close: async () => {
          try { await frames.close(); }
          finally { await rm(directory, { recursive: true, force: true }); }
        },
      };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async execute(plan: HtmlVideoDeliveryPlan, options: HtmlVideoExecutionOptions): Promise<MediaResource> {
    await this.#checkMedia();
    options.signal?.throwIfAborted();
    if (await stat(options.destination).then(() => true, () => false)) {
      throw new Error(`Video delivery destination already exists: ${options.destination}.`);
    }
    await mkdir(dirname(options.destination), { recursive: true });
    const directory = await mkdtemp(join(dirname(options.destination), ".hypit-html-video-"));
    const visualPath = join(directory, "visual.mp4");
    const audioPath = join(directory, "audio.wav");
    const outputPath = join(directory, "delivery.mp4");
    const backend = options.renderer === "electron"
      ? this.#electron ?? (() => { throw new Error("Electron HTML rendering requires an explicit electronPath."); })()
      : this.#chromium;
    try {
      const [visual, audio] = await Promise.all([
        renderHtmlVisualLocally({
          backend,
          request: plan.visual,
          destination: visualPath,
          options: {
            ffmpegPath: this.#media.ffmpegPath,
            ffprobePath: this.#media.ffprobePath,
            indexVideoFrames: this.#indexVideoFrames,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            onProgress: value => options.onProgress?.({
              phase: "visual",
              completed: value.completedFrames,
              total: value.totalFrames,
            }),
          },
        }),
        plan.audio === undefined ? Promise.resolve(undefined) : renderAudioProgramLocally({
          program: plan.audio,
          destination: audioPath,
          ffmpegPath: this.#media.ffmpegPath,
          ...(plan.range === undefined ? {} : { range: plan.range }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        }).then(value => {
          options.onProgress?.({ phase: "audio", completed: 1, total: 1 });
          return value;
        }),
      ]);
      options.signal?.throwIfAborted();
      options.onProgress?.({ phase: "mux", completed: 0, total: 1 });
      const result = await muxLocalVideo({
        visual,
        ...(audio === undefined ? {} : { audio }),
        destination: outputPath,
        ffmpegPath: this.#media.ffmpegPath,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      options.signal?.throwIfAborted();
      await rename(outputPath, options.destination);
      options.onProgress?.({ phase: "mux", completed: 1, total: 1 });
      return { ...result, address: options.destination };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function createLocalHtmlVideoExecutor(tools: LocalHtmlVideoTools = {}): HtmlVideoExecutor & HtmlFrameExecutor {
  return new LocalHtmlVideoExecutor(tools);
}
