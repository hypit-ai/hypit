import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import type { EndpointInvocationContext } from "@hypit/endpoint-kit";
import { stageHyperframesProject } from "@hypit/hyperframes/project";
import { sealRenderedVisual } from "@hypit/media";
import type { MediaFrameRange, RenderedVisual } from "@hypit/media";
import { verifyCompositableSurfaceBytes } from "@hypit/media-execution";
import { verifyHyperframesVisualRequest } from "@hypit/render-hyperframes";
import type { HyperframesVisualRequest } from "@hypit/render-hyperframes";
import { isStreamingResourceStore } from "@hypit/runtime";
import type { HyperframesExecutionOptions } from "./options.js";
import { assert, positiveInteger } from "./process.js";
import { runCaptureProcess } from "./capture-process.js";
import { finished } from "node:stream/promises";

export type HyperframesRenderProgress =
  | { readonly phase: "prepared"; readonly workers: number; readonly sourceFrames: number; readonly elapsedMs: number }
  | { readonly phase: "worker-initializing" | "worker-start" | "worker-complete"; readonly worker: number; readonly range: MediaFrameRange;
      readonly browserPid: number | undefined; readonly elapsedMs: number }
  | { readonly phase: "complete"; readonly frames: number; readonly elapsedMs: number };

export type RenderHyperframesVisualOptions = HyperframesExecutionOptions & {
  readonly resources: EndpointInvocationContext["resources"];
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: HyperframesRenderProgress) => void;
};

export function resolveExecutionOptions(options: HyperframesExecutionOptions) {
  const workers = options.workers ?? "auto";
  assert(workers === "auto" || (Number.isSafeInteger(workers) && workers > 0),
    "workers must be auto or a positive safe integer");
  const quality = options.quality ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "HyperFrames quality is invalid");
  const browserGpu = options.browserGpu ?? "hardware";
  assert(["auto", "software", "hardware"].includes(browserGpu), "HyperFrames browserGpu is invalid");
  return {
    workers: workers === "auto" ? Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))) : workers,
    quality, browserGpu,
    ffmpegPath: options.ffmpegPath ?? "ffmpeg",
    ffprobePath: options.ffprobePath ?? "ffprobe",
    initializationTimeoutMs: options.initializationTimeoutMs === undefined
      ? undefined
      : positiveInteger(options.initializationTimeoutMs, "initializationTimeoutMs"),
    frameTimeoutMs: options.frameTimeoutMs === undefined
      ? undefined
      : positiveInteger(options.frameTimeoutMs, "frameTimeoutMs"),
    processTimeoutMs: positiveInteger(options.processTimeoutMs ?? 30 * 60_000, "processTimeoutMs"),
    maxProcessOutputBytes: positiveInteger(options.maxProcessOutputBytes ?? 4 * 1024 * 1024, "maxProcessOutputBytes"),
    maxRenderedBytes: positiveInteger(options.maxRenderedBytes ?? 16 * 1024 * 1024 * 1024, "maxRenderedBytes"),
  };
}

/** Execute one attempt. Its deadline includes resource preparation and output storage. */
export async function renderHyperframesVisual(
  request: HyperframesVisualRequest,
  options: RenderHyperframesVisualOptions,
): Promise<RenderedVisual> {
  verifyHyperframesVisualRequest(request);
  const config = resolveExecutionOptions(options);
  const { document } = request;
  const range = request.range ?? { startFrame: 0, endFrameExclusive: document.frameCount };
  const controller = new AbortController();
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal]);
  const started = performance.now();
  let phase = "preparing resources";
  const timer = setTimeout(() => controller.abort(new Error(`HyperFrames render timed out during ${phase}`)), config.processTimeoutMs);
  let work: string | undefined;
  try {
    signal.throwIfAborted();
    work = await mkdtemp(join(tmpdir(), "hypit-hyperframes-local-"));
    await stageHyperframesProject({ document, directory: work, signal,
      read: async (artifact, readSignal) => {
        const io = { signal: readSignal! };
        const bytes = isStreamingResourceStore(options.resources)
          ? await options.resources.open(artifact.resource, io) : await options.resources.get(artifact.resource, io);
        assert(bytes !== undefined, `HyperFrames Artifact ${artifact.resource} is unavailable`);
        return bytes;
      },
      validateSurface: (surface, bytes, probeSignal) => verifyCompositableSurfaceBytes({ surface, bytes,
        ffprobePath: config.ffprobePath, processTimeoutMs: config.processTimeoutMs,
        maxProbeOutputBytes: config.maxProcessOutputBytes, signal: probeSignal! }),
    });
    phase = "rendering frames";
    await runCaptureProcess({ document, range, config, directory: work,
      engineModule: import.meta.resolve("@hyperframes/engine"),
      producerModule: import.meta.resolve("@hyperframes/producer"),
    }, signal, (event) => options.onProgress?.({ ...event, elapsedMs: Math.round(performance.now() - started) }));
    signal.throwIfAborted();
    phase = "storing output";
    const output = join(work, "visual.mp4");
    let artifact;
    if (isStreamingResourceStore(options.resources)) {
      const stream = createReadStream(output, { signal });
      const closed = finished(stream).catch(() => {});
      try { artifact = await options.resources.putStream(stream, "video/mp4", { signal }); }
      finally { stream.destroy(); await closed; }
    } else {
      artifact = await options.resources.put(await readFile(output, { signal }), "video/mp4", { signal });
    }
    signal.throwIfAborted();
    const frameCount = range.endFrameExclusive - range.startFrame;
    options.onProgress?.({ phase: "complete", frames: frameCount, elapsedMs: Math.round(performance.now() - started) });
    return sealRenderedVisual({ frameRate: document.frameRate, frameCount, canvas: document.canvas, artifact });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    controller.abort(error);
    throw error;
  } finally {
    clearTimeout(timer);
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  }
}
