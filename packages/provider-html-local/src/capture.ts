import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import type { HtmlProgram } from "@hypit/html-program";
import type { MediaFrameRange } from "@hypit/media";
import type { HtmlRasterProgress, resolveExecutionOptions } from "./render.js";
import { assert, mediaExecutablePath, openProcessInput, runProcess } from "./process.js";
import { verifyOutput } from "./output.js";
import { distributeFrameRange, requestedFrameRanges, sourceFrameAt, sourceWindows, videoSlots } from "./sampling.js";
import type { VideoSlot } from "./sampling.js";
import { CaptureConcurrency, renderWorkerLimit } from "./concurrency.js";
import { createOpaqueFrameCapture } from "./opaque-capture.js";
import { FrameSpanIndex } from "./frame-span-index.js";
import { OrderedFrameSink } from "./ordered-frame-sink.js";
import { decodeSourceFrameWindow, probeSourceVideo } from "./source-frame-decoder.js";
import { SourceFrameStore } from "./source-frame-store.js";
import type { SourceFrameWindow } from "./source-frame-store.js";
import { serveHtmlProgram } from "./server.js";
import { createGpuCapture, gpuCapturePages } from "./gpu-capture.js";
import type { SourceFrameUpdate } from "./opaque-capture.js";

export type CaptureInput = {
  readonly document: HtmlProgram;
  readonly frames?: readonly number[];
  readonly range: MediaFrameRange;
  readonly config: ReturnType<typeof resolveExecutionOptions> & { readonly chromePath: string };
  readonly directory: string;
  /** Complete browser prelude prepared by the Program owner before entering the child process. */
  readonly frameSelectionPrelude: string;
  /** Program Artifact identities projected onto the already-staged local project. */
  readonly artifactPaths: readonly (readonly [resource: string, path: string])[];
};

/** All browser and codec work belongs to this render's disposable process. */
export async function captureStagedVisual(input: CaptureInput, controller: AbortController,
  onProgress: (event: HtmlRasterProgress) => void): Promise<string> {
  const { document, range, config, directory: work } = input;
  const signal = controller.signal;
  const frameCount = input.frames?.length ?? range.endFrameExclusive - range.startFrame;
  const selected = input.frames === undefined ? undefined : new Set(input.frames);
  const at = (index: number) => input.frames?.[index] ?? range.startFrame + index;
  const fps = { num: document.frameRate.numerator, den: document.frameRate.denominator };
  const useGpu = input.frames === undefined && config.electronPath !== undefined;
  const limit = renderWorkerLimit(config, frameCount, fps.num / fps.den, useGpu && document.frameSources.length > 0);
  const concurrency = new CaptureConcurrency(limit, config.workers === "auto" && !useGpu);
  // GPU snapshots enter a bounded reorder queue; short consecutive batches
  // keep nearby source requests in the same decoder.
  const batchCount = useGpu ? Math.max(limit, Math.ceil(frameCount / 4)) : Math.max(limit, Math.ceil(frameCount / Math.max(1, Math.round(fps.num / fps.den))));
  const batches = distributeFrameRange({ startFrame: 0, endFrameExclusive: frameCount }, batchCount);
  let nextBatch = 0;
  const started = performance.now();
  const elapsedMs = () => Math.round(performance.now() - started);
  const [ffmpegPath, ffprobePath] = await Promise.all([
    mediaExecutablePath(config.ffmpegPath), mediaExecutablePath(config.ffprobePath),
  ]);
  const sessions = new Set<Browser>();
  const closing = new Map<Browser, Promise<void>>();
  const close = (session: Browser): Promise<void> => {
    let promise = closing.get(session);
    if (promise === undefined) {
      promise = session.close().finally(() => { sessions.delete(session); });
      closing.set(session, promise);
    }
    return promise;
  };
  const stage = async <T>(subject: string, timeoutMs: number | undefined, run: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    const timeout = timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(new Error(`HTML renderer ${subject} timed out after ${timeoutMs} ms`)), timeoutMs);
    let onAbort: () => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try { return await Promise.race([run(), stopped]); }
    finally {
      if (timeout !== undefined) clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  };
  let server: Awaited<ReturnType<typeof serveHtmlProgram>> | undefined;
  let gpu: Awaited<ReturnType<typeof createGpuCapture>> | undefined;
  let encoderCompletion: Promise<unknown> | undefined;
  let sourceFrameStore: SourceFrameStore | undefined;
  // Closing pages interrupts an in-flight capture as well as the next loop iteration.
  const abort = () => { for (const session of sessions) void close(session).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const artifactPaths = new Map(input.artifactPaths);
    const slots = videoSlots(document.frameSources, resource => {
      const path = artifactPaths.get(resource);
      assert(path !== undefined, `HTML renderer Artifact ${resource} has no staged path`);
      return `./${path}`;
    });
    const slotIndex = new FrameSpanIndex(slots);
    const requestedRanges = requestedFrameRanges(range, input.frames);
    const plannedSources = sourceWindows(slots, requestedRanges);
    const sourceTotal = plannedSources.reduce((sum, source) => sum + source.windows.reduce((count, window) =>
      count + window.endFrameExclusive - window.startFrame, 0), 0);
    const sources = new Map<string, { path: string; fps: VideoSlot["sourceFps"];
      metadata: Awaited<ReturnType<typeof probeSourceVideo>> }>();
    // Chrome needs dimensions before initialization. Pixel frames themselves
    // are decoded lazily for the screenshots that lease them.
    for (const source of useGpu ? [] : plannedSources) {
      const path = resolve(work, source.src);
      assert(path.startsWith(`${work}${sep}`), "HTML renderer source is outside the staged project");
      const metadata = await probeSourceVideo({ executable: ffprobePath, path,
        timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal });
      signal.throwIfAborted();
      sources.set(source.src, { path, fps: source.fps, metadata });
    }
    let extraction = 0;
    if (!useGpu) sourceFrameStore = new SourceFrameStore({ maxBytes: config.maxDecodedSourceBytes, signal,
      decode: (src, window) => {
        const source = sources.get(src);
        assert(source !== undefined, `HTML renderer source ${src} is outside the requested render`);
        return decodeSourceFrameWindow({ executable: ffmpegPath, path: source.path, outputDir: join(work, "decoded"),
          outputPrefix: `source-${extraction++}`, window, fps: source.fps, metadata: source.metadata,
          timeoutMs: config.processTimeoutMs, maxProcessOutputBytes: config.maxProcessOutputBytes, signal });
      },
      remove: async path => { await rm(path, { force: true }); },
    });
    const sourceDemand = (ranges: readonly MediaFrameRange[]): SourceFrameWindow[] => sourceWindows(slots, ranges, slotIndex)
      .flatMap(source => source.windows.map(window => ({ source: source.src, ...window })));
    const frameRanges = (startIndex: number, endIndex: number): MediaFrameRange[] => input.frames === undefined
      ? [{ startFrame: at(startIndex), endFrameExclusive: at(endIndex - 1) + 1 }]
      : input.frames.slice(startIndex, endIndex).map(frame => ({ startFrame: frame, endFrameExclusive: frame + 1 }));
    const activeFramePayloads = (frame: number) => {
        const payloads = new Map<string, { framePath: string; frameIndex: number }>();
        for (const slot of slotIndex.at(frame)) {
          const frameIndex = sourceFrameAt(slot, frame);
          // Browser initialization may seek outside the requested interval.
          if (selected === undefined ? frame < range.startFrame || frame >= range.endFrameExclusive : !selected.has(frame)) continue;
          const framePath = sourceFrameStore!.path(slot.src, frameIndex);
          assert(framePath !== undefined, `HTML renderer has no decoded frame ${frameIndex} for ${slot.id}`);
          payloads.set(slot.id, { framePath, frameIndex });
        }
        return payloads;
    };
    const gpuPages = useGpu ? await gpuCapturePages(document.canvas) : undefined;
    server = await serveHtmlProgram(work, gpuPages?.pages);
    if (gpuPages !== undefined) {
      gpu = await stage("GPU encoder initialization", config.initializationTimeoutMs,
        () => createGpuCapture(input, server!.url, gpuPages, controller, limit));
    }
    const serverUrl = server.url;
    const outputFrames = join(work, "frames");
    const output = join(work, "visual.mp4");
    const crf = { draft: 28, standard: 23, high: 18 }[config.quality];
    const encoder = input.frames === undefined && !useGpu ? openProcessInput({ executable: ffmpegPath,
      argv: ["-v", "error", "-y", "-f", "image2pipe", "-framerate", `${fps.num}/${fps.den}`, "-vcodec", "png", "-i", "pipe:0",
        "-frames:v", String(frameCount), "-an", "-c:v", "libx264", "-crf", String(crf),
        "-preset", config.quality === "draft" ? "veryfast" : "medium",
        // Chromium composites in sRGB: convert with the BT.709 matrix and tag the stream so players decode it the same way.
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
        "-movflags", "+faststart", output],
      timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal,
    }) : undefined;
    const orderedFrames = encoder === undefined ? undefined : new OrderedFrameSink({
      frameCount, maxPendingBytes: config.maxPendingFrameBytes, signal,
      writer: { write: encoder.write, close: async () => { await encoder.close(); } },
    });
    if (input.frames !== undefined) await mkdir(outputFrames);
    if (encoder !== undefined) {
      encoderCompletion = encoder.completed;
      void encoder.completed.catch((error) => {
        orderedFrames!.fail(error);
        controller.abort(error);
      });
    }
    onProgress?.({ phase: "prepared", workers: concurrency.target, sourceFrames: sourceTotal, elapsedMs: elapsedMs() });
    const jobs: Promise<void>[] = [];
    let active = 0, open = 0, initializing = 0, capturedFrames = 0, capturedBytes = 0;
    let sourceAcquireWorkerMs = 0, outputSubmitWorkerMs = 0;
    let startupMs = 0;
    const launch = (): void => {
      const worker = jobs.length;
      jobs.push(runWorker(worker));
      // Failure stops all jobs promptly; all jobs are still awaited below.
      void jobs[worker]!.catch(() => {});
    };
    const runWorker = async (worker: number): Promise<void> => {
      let session: Browser | undefined;
      let ready = false;
      let capturing = false;
      active++;
      open++;
      initializing++;
      const launched = performance.now();
      let setupMs = 0;
      try {
        signal.throwIfAborted();
        let browserPid: number | undefined;
        let videoStats: (() => Promise<unknown>) | undefined;
        let releaseVideo: (() => Promise<void>) | undefined;
        let captureFrame: (frame: number, sources: readonly SourceFrameUpdate[], ordinal: number, prepared: () => void)
          => Promise<Awaited<ReturnType<Awaited<ReturnType<typeof createOpaqueFrameCapture>>>>>;
        if (gpu !== undefined) {
          onProgress({ phase: "worker-initializing", worker, range, browserPid: undefined, elapsedMs: elapsedMs() });
          const gpuWorker = await stage(`worker ${worker} initialization`, config.initializationTimeoutMs, () => gpu!.createWorker());
          browserPid = gpuWorker.browserPid;
          captureFrame = gpuWorker.capture;
          videoStats = gpuWorker.stats;
          releaseVideo = gpuWorker.releaseSources;
        } else {
          session = await puppeteer.launch({ executablePath: config.chromePath, headless: true,
            defaultViewport: { width: document.canvas.width, height: document.canvas.height, deviceScaleFactor: 1 },
            args: ["--no-sandbox", "--disable-dev-shm-usage",
              ...(config.browserGpu === "software" ? ["--disable-gpu"] : []),
            ] });
          sessions.add(session);
          signal.throwIfAborted();
          const page = await session.newPage();
          if (config.initializationTimeoutMs !== undefined) {
            page.setDefaultTimeout(config.initializationTimeoutMs);
            page.setDefaultNavigationTimeout(config.initializationTimeoutMs);
          }
          await page.evaluateOnNewDocument(input.frameSelectionPrelude);
          browserPid = session.process()?.pid;
          onProgress?.({ phase: "worker-initializing", worker, range, browserPid, elapsedMs: elapsedMs() });
          await stage(`worker ${worker} initialization`, config.initializationTimeoutMs, async () => {
            await page.goto(serverUrl, { waitUntil: "load" });
            await page.evaluate(async () => {
              const program = (window as unknown as { __hypitFrameProgram?: { prepare(): Promise<void> } }).__hypitFrameProgram;
              if (program === undefined) throw new Error("HTML Program page ABI is missing");
              await program.prepare();
            });
          });
          captureFrame = await createOpaqueFrameCapture(page, document.canvas);
        }
        setupMs = performance.now() - launched;
        startupMs = Math.max(startupMs, setupMs);
        ready = true;
        initializing--;
        if (initializing === 0) concurrency.settled(performance.now());
        onProgress?.({ phase: "worker-start", worker, range, browserPid, elapsedMs: elapsedMs() });
        let completed = 0;
        let lastProgressAt = performance.now();
        const timing = { seekMs: 0, prepareMs: 0, screenshotMs: 0 };
        capturing = true;
        while (true) {
          // Retire only between complete batches, before claiming more work.
          if (active > concurrency.target) break;
          const batch = batches[nextBatch++];
          if (batch === undefined) break;
          for (let index = batch.startFrame; index < batch.endFrameExclusive; index++) {
            const frame = at(index);
            signal.throwIfAborted();
            const required = useGpu ? [] : sourceDemand(frameRanges(index, index + 1));
            // A preference is the unconsumed suffix, not the whole batch: frames
            // behind this Worker must become ordinary eviction candidates.
            const preferred = useGpu ? [] : sourceDemand(frameRanges(index, batch.endFrameExclusive));
            const sourceAcquireStarted = performance.now();
            const sourceLease = useGpu ? undefined : await sourceFrameStore!.acquire(required, preferred);
            sourceAcquireWorkerMs += performance.now() - sourceAcquireStarted;
            let captured: Awaited<ReturnType<typeof captureFrame>>;
            try {
              const sourceUpdates: SourceFrameUpdate[] = useGpu
                ? slotIndex.at(frame).map(slot => ({ id: slot.id, url: new URL(slot.src, serverUrl).href,
                  sample: { frame: sourceFrameAt(slot, frame), fps: slot.sourceFps, reverse: slot.sourceRate.numerator < 0n } }))
                : [...activeFramePayloads(frame)].map(([id, payload]) => ({ id,
                  url: new URL(relative(work, payload.framePath).split(sep).map(encodeURIComponent).join("/"), serverUrl).href }));
              captured = await stage(`worker ${worker} frame ${frame}`, config.frameTimeoutMs,
                () => captureFrame(frame, sourceUpdates, index, () => sourceLease?.release()));
            } finally {
              // Output submission may block behind an earlier frame. Never
              // retain source leases across that independent backpressure.
              sourceLease?.release();
            }
            if (input.frames !== undefined) {
              capturedBytes += captured.buffer.byteLength;
              assert(capturedBytes <= config.maxRenderedBytes, "HTML renderer PNG output exceeds its byte limit");
            }
            timing.seekMs += captured.seekMs;
            timing.prepareMs += captured.prepareMs;
            timing.screenshotMs += captured.screenshotMs;
            if (input.frames !== undefined) {
              await writeFile(join(outputFrames, `${String(index).padStart(9, "0")}.png`), captured.buffer);
            } else if (orderedFrames !== undefined) {
              const outputSubmitStarted = performance.now();
              await orderedFrames.submit(index, captured.buffer);
              outputSubmitWorkerMs += performance.now() - outputSubmitStarted;
            }
            completed++;
            capturedFrames++;
            if (performance.now() - lastProgressAt >= 1_000) {
              onProgress({ phase: "worker-progress", worker, completed, elapsedMs: elapsedMs() });
              lastProgressAt = performance.now();
            }
          }
          const decision = concurrency.complete({ now: performance.now(), frames: batch.endFrameExclusive - batch.startFrame,
            remainingFrames: frameCount - capturedFrames, startupMs, active: initializing === 0 ? active : 0 });
          if (decision !== undefined) {
            console.log(`Capture auto: ${active} -> ${decision.workers} browsers; ${decision.fps.toFixed(1)} frames/s; ${decision.reason}`);
            while (active < decision.workers && open < limit && nextBatch < batches.length) launch();
          }
        }
        console.log(`Capture worker ${worker}: ${completed} frames; startup ${Math.round(setupMs)} ms; `
          + `seek ${Math.round(timing.seekMs)} ms; prepare ${Math.round(timing.prepareMs)} ms; ${useGpu ? "texture and encode" : "PNG"} ${Math.round(timing.screenshotMs)} ms`);
        if (videoStats !== undefined) console.log(`Capture worker ${worker} video: ${JSON.stringify(await videoStats())}`);
        if (releaseVideo !== undefined) await stage(`worker ${worker} media cleanup`, 5_000, releaseVideo);
        onProgress({ phase: "worker-complete", worker, completed, browserPid, elapsedMs: elapsedMs() });
      } catch (error) {
        controller.abort(error);
        throw error;
      } finally {
        active--;
        if (!ready) initializing--;
        if (session !== undefined) await close(session);
        open--;
        // A restoring decision can wait for a retiring Chrome to release its
        // slot. Closing processes still count against the reserved ceiling.
        if (!signal.aborted && active < concurrency.target && open < limit && nextBatch < batches.length) launch();
      }
    };
    const initialWorkers = concurrency.target;
    console.log(`Capture: ${useGpu ? "shared GPU texture" : "opaque fast PNG"}; ${config.workers === "auto" ? "auto" : "fixed"} workers ${initialWorkers}, limit ${limit}`);
    for (let i = 0; i < initialWorkers; i++) launch();
    // New workers can join while earlier jobs run; collect every launched job.
    let awaited = 0;
    let failure: unknown;
    while (awaited < jobs.length) {
      const pending = jobs.slice(awaited);
      awaited = jobs.length;
      const results = await Promise.allSettled(pending);
      for (const result of results) if (result.status === "rejected") failure ??= result.reason;
    }
    if (failure !== undefined) throw failure;
    signal.throwIfAborted();
    await Promise.all(closing.values());
    if (sourceFrameStore !== undefined) console.log(`Capture source working set: ${sourceTotal} unique frames demanded; decoded ${sourceFrameStore.decodedFrames} frames; `
      + `redecoded ${Math.max(0, sourceFrameStore.decodedFrames - sourceTotal)}; decoder runs ${extraction}; `
      + `decoded bytes ${sourceFrameStore.decodedBytes}; largest frame ${sourceFrameStore.largestDecodedFrameBytes} bytes; `
      + `peak ${sourceFrameStore.peakResidentBytes} bytes; budget ${config.maxDecodedSourceBytes} bytes; `
      + `source acquire ${Math.round(sourceAcquireWorkerMs)} worker-ms; output submit ${Math.round(outputSubmitWorkerMs)} worker-ms`);
    if (input.frames !== undefined) return outputFrames;
    onProgress({ phase: "encoding", elapsedMs: elapsedMs() });
    if (gpu !== undefined) {
      const raw = await gpu.finish();
      await gpu.close();
      // Use the same integer clock for input packets, setts and the MP4 track.
      // Each frame occupies fps.den ticks, including the final packet.
      await runProcess({ executable: ffmpegPath,
        argv: ["-v", "error", "-y", "-r", String(fps.num), "-i", raw,
          "-an", "-c:v", "copy", "-bsf:v", `setts=pts=N*${fps.den}:dts=N*${fps.den}:duration=${fps.den}:time_base=1/${fps.num}`, "-video_track_timescale", String(fps.num),
          "-movflags", "+faststart", output],
        timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal });
    } else await orderedFrames!.close();
    const outputStat = await stat(output);
    assert(outputStat.size > 0 && outputStat.size <= config.maxRenderedBytes, "HTML renderer output is empty or exceeds its byte limit");
    await verifyOutput({ path: output, document: { ...document, frameCount }, ffprobePath,
      timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal });
    signal.throwIfAborted();
    return output;
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    await Promise.allSettled([...sessions].map(close));
    if (sourceFrameStore !== undefined) await sourceFrameStore.close();
    if (encoderCompletion !== undefined) await Promise.allSettled([encoderCompletion]);
    if (gpu !== undefined) await gpu.close();
    if (server !== undefined) await server.close();
  }
}
