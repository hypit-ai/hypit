import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EndpointInvocationContext } from "@hypit/endpoint";
import type { BlobRef } from "@hypit/protocol";
import { sealTimelineVisual } from "@hypit/media";
import type { TimelineVisual } from "@hypit/media";
import type { FrameSpan } from "@hypit/timeline";
import { verifyCompositableSurfaceFile, verifyPictureArtifactFile } from "./surface-validation.js";
import { verifyHtmlRasterRequest, verifyHtmlFrameRequest } from "@hypit/html-program";
import type { HtmlRasterRequest, HtmlFrameRequest, HtmlFrameImages } from "@hypit/html-program";
import { isStreamingResourceStore } from "@hypit/endpoint";
import type { HtmlExecutionOptions } from "./options.js";
import { assert, positiveInteger } from "./process.js";
import { runCaptureProcess } from "./capture-process.js";
import type { CaptureWorkerLaunch } from "./capture-process.js";
import { finished } from "node:stream/promises";
import { autoWorkerLimit, renderWorkerLimit } from "./concurrency.js";
import { requestedFrameRanges } from "./sampling.js";
import { htmlArtifactRelativePath, stageHtmlProgram } from "./stage.js";
import { assertLocalHtmlFrameSupport, assertLocalHtmlRasterSupport } from "./support.js";

export type HtmlRasterProgress =
  | { readonly phase: "staging" | "encoding" | "storing"; readonly elapsedMs: number }
  | { readonly phase: "decoding"; readonly completed: number; readonly total: number; readonly elapsedMs: number }
  | { readonly phase: "worker-progress"; readonly worker: number; readonly completed: number; readonly elapsedMs: number }
  | { readonly phase: "prepared"; readonly workers: number; readonly sourceFrames: number; readonly elapsedMs: number }
  | { readonly phase: "worker-initializing" | "worker-start"; readonly worker: number; readonly range: FrameSpan;
      readonly browserPid: number | undefined; readonly elapsedMs: number }
  | { readonly phase: "worker-complete"; readonly worker: number; readonly completed: number;
      readonly browserPid: number | undefined; readonly elapsedMs: number }
  | { readonly phase: "complete"; readonly frames: number; readonly elapsedMs: number };

export type HtmlRasterOptions = HtmlExecutionOptions & {
  readonly resources: EndpointInvocationContext["resources"];
  readonly signal?: AbortSignal;
  readonly onDiagnostic?: (diagnostic: import("@hypit/endpoint").ExecutionDiagnostic) => Promise<void>;
  readonly onProgress?: (event: HtmlRasterProgress) => void;
};

/** One concrete capture implementation selected by an Endpoint package. */
type HtmlRasterBackendBase = {
  readonly label: string;
  readonly executablePath: string;
  readonly workerLaunch: (directory: string) => CaptureWorkerLaunch;
  readonly verifyExecutable: () => Promise<void>;
};

export type HtmlRasterBackend = HtmlRasterBackendBase & (
  | { readonly mode: "frame-buffer"; readonly requiresHardwareGpu?: never; readonly encodedPipeline?: never }
  | { readonly mode: "encoded-stream"; readonly requiresHardwareGpu?: boolean; readonly encodedPipeline: string }
);

export function resolveLocalHtmlExecutionOptions(options: HtmlExecutionOptions) {
  const workers = options.workers ?? "auto";
  assert(workers === "auto" || (Number.isSafeInteger(workers) && workers > 0),
    "workers must be auto or a positive safe integer");
  const browserGpu = options.browserGpu ?? "hardware";
  assert(["auto", "software", "hardware"].includes(browserGpu), "HTML renderer browserGpu is invalid");
  return {
    workers,
    maxWorkers: workers === "auto" ? positiveInteger(options.maxWorkers ?? autoWorkerLimit(), "maxWorkers") : workers,
    browserGpu,
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
    artifactStagingConcurrency: positiveInteger(options.artifactStagingConcurrency ?? 4, "artifactStagingConcurrency"),
    maxPendingFrameBytes: positiveInteger(options.maxPendingFrameBytes ?? 256 * 1024 * 1024, "maxPendingFrameBytes"),
    maxDecodedSourceBytes: positiveInteger(options.maxDecodedSourceBytes ?? 1024 * 1024 * 1024, "maxDecodedSourceBytes"),
    maxRenderedBytes: positiveInteger(options.maxRenderedBytes ?? 16 * 1024 * 1024 * 1024, "maxRenderedBytes"),
  };
}

export type ResolvedHtmlExecutionOptions = ReturnType<typeof resolveLocalHtmlExecutionOptions>;

export { renderWorkerLimit } from "./concurrency.js";

/** Execute one renderer-specific local attempt. Its deadline includes staging and output storage. */
export function rasterizeHtmlWithBackend(
  request: HtmlRasterRequest,
  options: HtmlRasterOptions,
  backend: HtmlRasterBackend,
): Promise<TimelineVisual>;
export function rasterizeHtmlWithBackend(
  request: HtmlFrameRequest,
  options: HtmlRasterOptions,
  backend: HtmlRasterBackend,
): Promise<HtmlFrameImages>;
export async function rasterizeHtmlWithBackend(
  request: HtmlRasterRequest | HtmlFrameRequest,
  options: HtmlRasterOptions,
  backend: HtmlRasterBackend,
): Promise<TimelineVisual | HtmlFrameImages> {
  const frames = "frames" in request ? request.frames : undefined;
  if (frames === undefined) verifyHtmlRasterRequest(request as HtmlRasterRequest);
  else verifyHtmlFrameRequest(request as HtmlFrameRequest);
  const execution = resolveLocalHtmlExecutionOptions(options);
  if (frames === undefined) assertLocalHtmlRasterSupport(request as HtmlRasterRequest);
  else assertLocalHtmlFrameSupport(request as HtmlFrameRequest);
  if (frames !== undefined && backend.mode !== "frame-buffer") {
    throw new Error("The selected renderer produces encoded video and cannot capture PNG frames");
  }
  const encodedCapture = frames === undefined && backend.mode === "encoded-stream";
  assert(!backend.requiresHardwareGpu || execution.browserGpu !== "software",
    `${backend.label} requires browserGpu auto or hardware`);
  const config = execution;
  const document = request.program;
  const range = frames === undefined
    ? (request as HtmlRasterRequest).range ?? { startFrame: 0, endFrameExclusive: document.frameCount }
    : { startFrame: frames[0]!, endFrameExclusive: frames.at(-1)! + 1 };
  const frameCount = frames?.length ?? range.endFrameExclusive - range.startFrame;
  const frameSelection = requestedFrameRanges(range, frames);
  const controller = new AbortController();
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal]);
  const started = performance.now();
  let phaseStarted = started;
  let phase = "preparing resources";
  const timer = setTimeout(() => controller.abort(new Error(`HTML renderer render timed out during ${phase}`)), config.processTimeoutMs);
  let work: string | undefined;
  const diagnostics: Promise<void>[] = [];
  const diagnostic = (message: string) => {
    if (options.onDiagnostic === undefined) return;
    const pending = options.onDiagnostic({ level: "info", message });
    diagnostics.push(pending);
    void pending.catch(() => {});
  };
  const changePhase = (next: string) => {
    const now = performance.now();
    diagnostic(`${phase}: ${Math.round(now - phaseStarted)} ms`);
    phaseStarted = now;
    phase = next;
  };
  try {
    signal.throwIfAborted();
    await backend.verifyExecutable();
    await options.onDiagnostic?.({ level: "info", message:
      `Capture ${frameCount} frames; workers ${config.workers} (limit ${renderWorkerLimit(config, frameCount,
        document.frameRate.numerator / document.frameRate.denominator, encodedCapture && document.videoSources.length > 0)}); `
      + `${backend.label}; GPU ${config.browserGpu}; executable ${backend.executablePath}`
      + `; artifact staging concurrency ${config.artifactStagingConcurrency}`
      + `; decoded source budget ${config.maxDecodedSourceBytes} bytes`
      + (frames === undefined
        ? `; delivery quality ${(request as HtmlRasterRequest).delivery.encoding.quality}; `
          + `${encodedCapture ? backend.encodedPipeline : "ordered FFmpeg PNG pipe"}; `
          + `pending frame budget ${config.maxPendingFrameBytes} bytes; FFmpeg ${config.ffmpegPath}`
        : "; PNG output") });
    options.onProgress?.({ phase: "staging", elapsedMs: 0 });
    work = await mkdtemp(join(tmpdir(), "hypit-html-local-"));
    const read: import("./stage.js").HtmlArtifactReader = async (artifact, readSignal) => {
        const io = { signal: readSignal! };
        const bytes = isStreamingResourceStore(options.resources)
          ? await options.resources.open(artifact.resource, io) : await options.resources.get(artifact.resource, io);
        assert(bytes !== undefined, `HTML renderer Artifact ${artifact.resource} is unavailable`);
        return bytes;
      };
    await stageHtmlProgram({ document, directory: work, signal, read,
      frameSelection,
      maxConcurrentArtifacts: config.artifactStagingConcurrency,
      validateSurface: (surface, path, probeSignal) => verifyCompositableSurfaceFile({ surface, path,
        ffprobePath: config.ffprobePath, processTimeoutMs: config.processTimeoutMs,
        maxProbeOutputBytes: config.maxProcessOutputBytes, signal: probeSignal! }),
      validatePicture: (picture, path, probeSignal) => verifyPictureArtifactFile({ picture, path,
        ffprobePath: config.ffprobePath, processTimeoutMs: config.processTimeoutMs,
        maxProbeOutputBytes: config.maxProcessOutputBytes, signal: probeSignal! }),
    });
    changePhase("preparing source media");
    await runCaptureProcess({ document, range,
      ...(frames === undefined
        ? { delivery: (request as HtmlRasterRequest).delivery }
        : { frames, picture: (request as HtmlFrameRequest).picture }), config, directory: work,
      frameSelection,
      artifactPaths: document.artifacts.flatMap(({ id, artifact }) => {
        const path = htmlArtifactRelativePath(document, id);
        return [[id, path] as const, [artifact.resource, path] as const];
      }),
    }, signal, (event) => {
      if (event.phase === "prepared") changePhase("starting browsers");
      if (event.phase === "worker-start" && phase === "starting browsers") changePhase("capturing frames");
      if (event.phase === "encoding") changePhase("encoding and verifying video");
      options.onProgress?.({ ...event, elapsedMs: Math.round(performance.now() - started) });
    }, backend.workerLaunch(work), options.onDiagnostic);
    signal.throwIfAborted();
    changePhase("storing output");
    options.onProgress?.({ phase: "storing", elapsedMs: Math.round(performance.now() - started) });
    const store = async (output: string, mediaType: string) => {
      if (isStreamingResourceStore(options.resources)) {
        const stream = createReadStream(output, { signal });
        const closed = finished(stream).catch(() => {});
        try { return await options.resources.putStream(stream, mediaType, { signal }); }
        finally { stream.destroy(); await closed; }
      }
      return options.resources.put(await readFile(output, { signal }), mediaType, { signal });
    };
    let result: TimelineVisual | HtmlFrameImages;
    if (frames === undefined) {
      result = sealTimelineVisual({ frameRate: document.frameRate, frameCount, canvas: document.canvas,
        delivery: (request as HtmlRasterRequest).delivery,
        artifact: await store(join(work, "visual.mp4"), "video/mp4") });
    } else {
      const artifacts: BlobRef[] = [];
      for (let index = 0; index < frames.length; index++) {
        signal.throwIfAborted();
        artifacts.push(await store(join(work, "frames", `${String(index).padStart(9, "0")}.png`), "image/png"));
      }
      result = { picture: (request as HtmlFrameRequest).picture,
        frames: frames.map((frame, index) => ({ frame, artifact: artifacts[index]! })) };
    }
    signal.throwIfAborted();

    changePhase("complete");
    await Promise.all(diagnostics);
    options.onProgress?.({ phase: "complete", frames: frameCount, elapsedMs: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    controller.abort(error);
    throw error;
  } finally {
    clearTimeout(timer);
    if (work !== undefined) await rm(work, { recursive: true, force: true });
    await Promise.all(diagnostics);
  }
}
