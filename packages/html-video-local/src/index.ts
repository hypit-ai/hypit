import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromiumHtmlBackend } from "@hypit/html-chromium-local";
import { electronHtmlBackend } from "@hypit/html-electron-local";
import { renderHtmlVisualLocally, type HtmlCaptureBackend } from "@hypit/html-render-local";
import type {
  HtmlVideoExecutionOptions,
  HtmlVideoExecutor,
  HtmlVideoDeliveryPlan,
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

class LocalHtmlVideoExecutor implements HtmlVideoExecutor {
  readonly #media: LocalMediaToolchain;
  #mediaReady: Promise<void> | undefined;
  readonly #chromium: HtmlCaptureBackend;
  readonly #electron: HtmlCaptureBackend | undefined;

  constructor(tools: LocalHtmlVideoTools) {
    this.#media = resolveLocalMediaToolchain(tools);
    this.#chromium = chromiumHtmlBackend(tools.chromePath);
    this.#electron = tools.electronPath === undefined ? undefined : electronHtmlBackend(tools.electronPath);
  }

  async execute(plan: HtmlVideoDeliveryPlan, options: HtmlVideoExecutionOptions): Promise<MediaResource> {
    this.#mediaReady ??= inspectLocalMediaToolchain(this.#media).then((inspection) => {
      if (inspection.state !== "ready") {
        throw new Error(`Local Media toolchain is ${inspection.state}: ${inspection.diagnostic} Install compatible FFmpeg and FFprobe executables or configure their explicit paths.`);
      }
    });
    await this.#mediaReady;
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

export function createLocalHtmlVideoExecutor(tools: LocalHtmlVideoTools = {}): HtmlVideoExecutor {
  return new LocalHtmlVideoExecutor(tools);
}
