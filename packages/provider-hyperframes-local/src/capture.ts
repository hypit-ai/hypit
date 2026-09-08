import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { HyperframesDocument } from "@hypit/hyperframes";
import type { MediaFrameRange } from "@hypit/media";
import type { HyperframesRenderProgress, resolveExecutionOptions } from "./render.js";
import { assert, runProcess } from "./process.js";
import { verifyOutput } from "./output.js";
import { distributeFrameRange, sourceFrameAt, sourceWindows, videoSlots } from "./sampling.js";

export type CaptureInput = {
  readonly document: HyperframesDocument;
  readonly range: MediaFrameRange;
  readonly config: ReturnType<typeof resolveExecutionOptions>;
  readonly directory: string;
  readonly engineModule: string;
  readonly producerModule: string;
};

/** All browser and codec work belongs to this render's disposable process. */
export async function captureStagedVisual(input: CaptureInput, controller: AbortController,
  onProgress: (event: HyperframesRenderProgress) => void): Promise<string> {
  const { document, range, config, directory: work } = input;
  const signal = controller.signal;
  const frameCount = range.endFrameExclusive - range.startFrame;
  const tasks = distributeFrameRange(range, config.workers);
  const fps = { num: document.frameRate.numerator, den: document.frameRate.denominator };
  const started = performance.now();
  const elapsedMs = () => Math.round(performance.now() - started);
  const engine = await import(input.engineModule) as typeof import("@hyperframes/engine");
  const { createFileServer } = await import(input.producerModule) as typeof import("@hyperframes/producer");
  type Session = Awaited<ReturnType<typeof engine.createCaptureSession>>;
  const sessions = new Set<Session>();
  const closing = new Map<Session, Promise<void>>();
  const close = (session: Session): Promise<void> => {
    let promise = closing.get(session);
    if (promise === undefined) {
      promise = engine.closeCaptureSession(session).finally(() => { sessions.delete(session); });
      closing.set(session, promise);
    }
    return promise;
  };
  const stage = async <T>(subject: string, timeoutMs: number | undefined, run: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    const timeout = timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(new Error(`HyperFrames ${subject} timed out after ${timeoutMs} ms`)), timeoutMs);
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
  let server: Awaited<ReturnType<typeof createFileServer>> | undefined;
  // Closing pages interrupts an in-flight capture as well as the next loop iteration.
  const abort = () => { for (const session of sessions) void close(session).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const slots = videoSlots(await readFile(join(work, "index.html"), "utf8"));
    const sources = new Map<string, { frames: Map<number, string>; width: number; height: number }>();
    let sourceFrames = 0;
    // One source at a time bounds decoder pressure independently of browser concurrency.
    for (const source of sourceWindows(slots, range)) {
      const path = resolve(work, source.src);
      assert(path.startsWith(`${work}${sep}`), "HyperFrames source is outside the staged project");
      const frames = new Map<number, string>();
      let width = 0, height = 0;
      for (const window of source.windows) {
        signal.throwIfAborted();
        const count = window.endFrameExclusive - window.startFrame;
        const extracted = await engine.extractVideoFramesRange(path, `source-${sources.size}-${window.startFrame}`,
          window.startFrame * source.fps.den / source.fps.num, count * source.fps.den / source.fps.num,
          { fps: source.fps, outputDir: join(work, "decoded"), format: "png", ...(count === 1 ? { finalFrameOnly: true } : {}) },
          signal, { ffmpegProcessTimeout: config.processTimeoutMs });
        assert(extracted.totalFrames === count, `HyperFrames expected ${count} source frames, decoded ${extracted.totalFrames}`);
        for (let index = 0; index < count; index++) {
          const framePath = extracted.framePaths.get(index);
          assert(framePath !== undefined, "HyperFrames extraction omitted a requested source frame");
          frames.set(window.startFrame + index, framePath);
        }
        width = extracted.metadata.width;
        height = extracted.metadata.height;
        sourceFrames += count;
      }
      sources.set(source.src, { frames, width, height });
    }
    class SelectedFrameLookup extends engine.FrameLookupTable {
      override getActiveFramePayloads(time: number) {
        const frame = Math.round(time * fps.num / fps.den);
        const payloads = new Map<string, { framePath: string; frameIndex: number }>();
        for (const slot of slots) {
          if (frame < slot.startFrame || frame >= slot.endFrameExclusive) continue;
          const frameIndex = sourceFrameAt(slot, frame);
          const framePath = sources.get(slot.src)?.frames.get(frameIndex);
          // Browser initialization may seek outside the requested interval.
          if (frame < range.startFrame || frame >= range.endFrameExclusive) continue;
          assert(framePath !== undefined, `HyperFrames has no decoded frame ${frameIndex} for ${slot.id}`);
          payloads.set(slot.id, { framePath, frameIndex });
        }
        return payloads;
      }
    }
    server = await createFileServer({ projectDir: work, port: 0, fps });
    const serverUrl = server.url;
    const outputFrames = join(work, "frames");
    await mkdir(outputFrames);
    onProgress?.({ phase: "prepared", workers: tasks.length, sourceFrames, elapsedMs: elapsedMs() });
    const results = await Promise.allSettled(tasks.map(async (task, worker) => {
      let session: Session | undefined;
      try {
        signal.throwIfAborted();
        const directory = join(work, `worker-${worker}`);
        await mkdir(directory);
        const injector = engine.createVideoFrameInjector(slots.length === 0 ? null : new SelectedFrameLookup(), {
          frameSrcResolver: (path) => new URL(relative(work, path).split(sep).map(encodeURIComponent).join("/"), `${serverUrl}/`).href,
        });
        session = await engine.createCaptureSession(serverUrl, directory, {
          ...document.canvas, fps, format: "png",
          compositionDurationSeconds: document.frameCount * fps.den / fps.num,
          skipReadinessVideoIds: slots.map((slot) => slot.id),
          videoMetadataHints: slots.flatMap((slot) => {
            const source = sources.get(slot.src);
            return source === undefined ? [] : [{ id: slot.id, width: source.width, height: source.height }];
          }),
        }, injector, { browserGpuMode: config.browserGpu, enableBrowserPool: false, forceScreenshot: true, useDrawElement: false });
        sessions.add(session);
        signal.throwIfAborted();
        const activeSession = session;
        const browserPid = session.browser.process()?.pid;
        onProgress?.({ phase: "worker-initializing", worker, range: task, browserPid, elapsedMs: elapsedMs() });
        await stage(`worker ${worker} initialization`, config.initializationTimeoutMs, () => engine.initializeSession(activeSession));
        // HyperFrames' PNG capture clears the page/composition backgrounds for
        // standalone transparent exports. Here PNGs are intermediate frames of
        // a Film, whose authored Canvas background still belongs in the image.
        await activeSession.page.evaluate(() => {
          globalThis.document.getElementById("__hf_transparent_bg__")?.remove();
        });
        onProgress?.({ phase: "worker-start", worker, range: task, browserPid, elapsedMs: elapsedMs() });
        for (let frame = task.startFrame; frame < task.endFrameExclusive; frame++) {
          signal.throwIfAborted();
          const captured = await stage(`worker ${worker} frame ${frame}`, config.frameTimeoutMs,
            () => engine.captureFrameToBuffer(activeSession, frame, frame * fps.den / fps.num));
          await writeFile(join(outputFrames, `${String(frame - range.startFrame).padStart(9, "0")}.png`), captured.buffer);
        }
        onProgress?.({ phase: "worker-complete", worker, range: task, browserPid, elapsedMs: elapsedMs() });
      } catch (error) {
        controller.abort(error);
        throw error;
      } finally {
        if (session !== undefined) await close(session);
      }
    }));
    signal.throwIfAborted();
    for (const result of results) if (result.status === "rejected") throw result.reason;
    await Promise.all(closing.values());
    const output = join(work, "visual.mp4");
    const crf = { draft: 28, standard: 23, high: 18 }[config.quality];
    await runProcess({ executable: config.ffmpegPath,
      argv: ["-v", "error", "-y", "-framerate", `${fps.num}/${fps.den}`, "-i", join(outputFrames, "%09d.png"),
        "-frames:v", String(frameCount), "-an", "-c:v", "libx264", "-crf", String(crf),
        "-preset", config.quality === "draft" ? "veryfast" : "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
      timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal });
    const outputStat = await stat(output);
    assert(outputStat.size > 0 && outputStat.size <= config.maxRenderedBytes, "HyperFrames output is empty or exceeds its byte limit");
    await verifyOutput({ path: output, document: { ...document, frameCount }, ffprobePath: config.ffprobePath,
      timeoutMs: config.processTimeoutMs, maxOutputBytes: config.maxProcessOutputBytes, signal });
    signal.throwIfAborted();
    return output;
  } finally {
    signal.removeEventListener("abort", abort);
    await Promise.allSettled([...sessions].map(close));
    if (server !== undefined) await server.close();
  }
}
