import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HtmlFrameRequest, HtmlRasterRequest, RenderedVisual } from "@hypit/html-program";
import { CaptureConcurrency, captureBatches, htmlWorkerPlan } from "./concurrency.js";
import { OrderedFrameSink } from "./ordered-frame-sink.js";
import { serveHtmlProgram } from "./server.js";
import { createPreparedSourceFrames } from "./source-frames.js";
import { stageHtmlProgram } from "./stage.js";
import type { HtmlCaptureBackend, LocalHtmlRenderOptions, StagedHtmlProgram } from "./types.js";

async function staged<T>(program: HtmlRasterRequest["program"], selection: readonly { startFrame: number; endFrameExclusive: number }[],
  options: LocalHtmlRenderOptions,
  run: (staged: StagedHtmlProgram) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "hypit-html-render-"));
  let server: Awaited<ReturnType<typeof serveHtmlProgram>> | undefined;
  try {
    const files = await stageHtmlProgram(program, directory, selection);
    const sourceFrames = program.videoSources.length === 0 ? undefined : await createPreparedSourceFrames({
      program,
      selection,
      artifactPaths: files.artifactPaths,
      directory: join(directory, "decoded"),
      ffmpegPath: options.ffmpegPath ?? "ffmpeg",
      ffprobePath: options.ffprobePath ?? "ffprobe",
      maxBytes: options.maxDecodedSourceBytes ?? 512 * 1024 * 1024,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    server = await serveHtmlProgram(directory, sourceFrames);
    return await run({ ...files, url: server.url });
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function frameBufferVisual(input: {
  readonly backend: Extract<HtmlCaptureBackend, { readonly mode: "frame-buffer" }>;
  readonly request: HtmlRasterRequest;
  readonly staged: StagedHtmlProgram;
  readonly destination: string;
  readonly options: LocalHtmlRenderOptions;
}): Promise<RenderedVisual> {
  const range = input.request.range ?? { startFrame: 0, endFrameExclusive: input.request.program.frameCount };
  const frameCount = range.endFrameExclusive - range.startFrame;
  if (frameCount <= 0) throw new Error("HTML capture frame range is empty.");
  const ffmpeg = spawn(input.options.ffmpegPath ?? "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe",
    "-framerate", `${input.request.program.frameRate.numerator}/${input.request.program.frameRate.denominator}`,
    "-i", "pipe:0", "-frames:v", String(frameCount), "-an", "-c:v", "libx264",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.destination,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let diagnostic = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString("utf8"); });
  const encoderExit = once(ffmpeg, "exit") as Promise<[number | null]>;
  const sink = new OrderedFrameSink({
    frameCount,
    maxPendingBytes: input.options.maxPendingFrameBytes ?? 256 * 1024 * 1024,
    writer: {
      write: async (bytes) => { if (!ffmpeg.stdin.write(bytes)) await once(ffmpeg.stdin, "drain"); },
      close: async () => { ffmpeg.stdin.end(); },
    },
  });
  const controller = new AbortController();
  const signal = input.options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.options.signal]);
  const abort = () => ffmpeg.kill("SIGTERM");
  signal.addEventListener("abort", abort, { once: true });
  const fps = input.request.program.frameRate.numerator / input.request.program.frameRate.denominator;
  const plan = htmlWorkerPlan(input.options, frameCount, fps);
  const concurrency = new CaptureConcurrency(plan.limit, plan.automatic);
  const batches = captureBatches(frameCount, fps, plan.limit);
  let nextBatch = 0;
  let complete = 0;
  let active = 0;
  let initializing = 0;
  let startupMs = 0;
  let failure: { readonly error: unknown } | undefined;
  const tasks: Promise<void>[] = [];
  const launch = (): void => {
    active += 1;
    initializing += 1;
    let stillInitializing = true;
    const task = (async () => {
      const launched = performance.now();
      let worker: Awaited<ReturnType<typeof input.backend.createWorker>> | undefined;
      try {
        worker = await input.backend.createWorker(input.request, input.staged, { ...input.options, signal });
        startupMs = Math.max(startupMs, performance.now() - launched);
        initializing -= 1;
        stillInitializing = false;
        if (initializing === 0) concurrency.settled(performance.now());
        while (true) {
          signal.throwIfAborted();
          if (active > concurrency.target) return;
          const batch = batches[nextBatch++];
          if (batch === undefined) return;
          for (let ordinal = batch.startFrame; ordinal < batch.endFrameExclusive; ordinal += 1) {
            signal.throwIfAborted();
            const frame = range.startFrame + ordinal;
            await sink.submit(ordinal, await worker.capture(frame, input.request.picture.alpha === "straight"));
            complete += 1;
            input.options.onProgress?.({ completedFrames: complete, totalFrames: frameCount });
          }
          concurrency.complete({
            now: performance.now(),
            frames: batch.endFrameExclusive - batch.startFrame,
            remainingFrames: frameCount - complete,
            startupMs,
            active: initializing === 0 ? active : 0,
          });
          while (!signal.aborted && active < concurrency.target && nextBatch < batches.length) launch();
        }
      } finally {
        if (stillInitializing) {
          initializing -= 1;
          if (initializing === 0) concurrency.settled(performance.now());
        }
        await worker?.close();
      }
    })().catch((error: unknown) => {
      if (failure !== undefined) return;
      failure = { error };
      sink.fail(error);
      controller.abort(error);
    }).finally(() => {
      active -= 1;
      if (!signal.aborted && nextBatch < batches.length && active < concurrency.target) launch();
    });
    tasks.push(task);
  };
  try {
    while (active < concurrency.target) launch();
    let waited = 0;
    while (waited < tasks.length) {
      const current = tasks.slice(waited);
      waited = tasks.length;
      await Promise.all(current);
    }
    if (failure !== undefined) throw failure.error;
    await sink.close();
    const [code] = await encoderExit;
    if (code !== 0) throw new Error(`HTML visual encoding failed (${code ?? "signal"}): ${diagnostic.trim()}`);
    const information = await stat(input.destination);
    return {
      resource: { address: input.destination, mediaType: "video/mp4", size: information.size },
      frameRate: structuredClone(input.request.program.frameRate), frameCount,
      width: input.request.program.canvas.width, height: input.request.program.canvas.height,
    };
  } finally {
    signal.removeEventListener("abort", abort);
    if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) ffmpeg.kill("SIGTERM");
  }
}

export async function renderHtmlVisualLocally(input: {
  readonly backend: HtmlCaptureBackend;
  readonly request: HtmlRasterRequest;
  readonly destination: string;
  readonly options?: LocalHtmlRenderOptions;
}): Promise<RenderedVisual> {
  const range = input.request.range ?? { startFrame: 0, endFrameExclusive: input.request.program.frameCount };
  return await staged(input.request.program, [range], input.options ?? {}, async (files) => input.backend.mode === "encoded-stream"
    ? await input.backend.renderVisual(input.request, files, input.destination, {
        ffmpegPath: input.options?.ffmpegPath ?? "ffmpeg", ...input.options,
      })
    : await frameBufferVisual({ backend: input.backend, request: input.request, staged: files,
        destination: input.destination, options: input.options ?? {} }));
}

export async function renderHtmlFramesLocally(input: {
  readonly backend: HtmlCaptureBackend;
  readonly request: HtmlFrameRequest;
  readonly destination: string;
  readonly options?: LocalHtmlRenderOptions;
}): Promise<readonly string[]> {
  if (input.backend.mode !== "frame-buffer") throw new Error(`HTML backend ${input.backend.id} does not render frame images.`);
  if (input.request.frames.length === 0) return [];
  const backend = input.backend;
  const selection = input.request.frames.map((frame) => ({ startFrame: frame, endFrameExclusive: frame + 1 }));
  return await staged(input.request.program, selection, input.options ?? {}, async (files) => {
    await mkdir(input.destination, { recursive: true });
    const paths = new Array<string>(input.request.frames.length);
    const options = input.options ?? {};
    const controller = new AbortController();
    const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal]);
    const fps = input.request.program.frameRate.numerator / input.request.program.frameRate.denominator;
    const plan = htmlWorkerPlan(options, input.request.frames.length, fps);
    const concurrency = new CaptureConcurrency(plan.limit, plan.automatic);
    const batches = captureBatches(input.request.frames.length, fps, plan.limit);
    let nextBatch = 0;
    let complete = 0;
    let active = 0;
    let initializing = 0;
    let startupMs = 0;
    let failure: { readonly error: unknown } | undefined;
    const tasks: Promise<void>[] = [];
    const launch = (): void => {
      active += 1;
      initializing += 1;
      let stillInitializing = true;
      const task = (async () => {
        const launched = performance.now();
        let worker: Awaited<ReturnType<typeof backend.createWorker>> | undefined;
        try {
          worker = await backend.createWorker(input.request, files, { ...options, signal });
          startupMs = Math.max(startupMs, performance.now() - launched);
          initializing -= 1;
          stillInitializing = false;
          if (initializing === 0) concurrency.settled(performance.now());
          while (true) {
            signal.throwIfAborted();
            if (active > concurrency.target) return;
            const batch = batches[nextBatch++];
            if (batch === undefined) return;
            for (let ordinal = batch.startFrame; ordinal < batch.endFrameExclusive; ordinal += 1) {
              signal.throwIfAborted();
              const frame = input.request.frames[ordinal]!;
              if (!Number.isSafeInteger(frame) || frame < 0 || frame >= input.request.program.frameCount) {
                throw new Error(`HTML frame ${frame} is outside Programme.`);
              }
              const path = join(input.destination, `${String(frame).padStart(8, "0")}.png`);
              await writeFile(path, await worker.capture(frame, input.request.picture.alpha === "straight"));
              paths[ordinal] = path;
              complete += 1;
              options.onProgress?.({ completedFrames: complete, totalFrames: input.request.frames.length });
            }
            concurrency.complete({
              now: performance.now(),
              frames: batch.endFrameExclusive - batch.startFrame,
              remainingFrames: input.request.frames.length - complete,
              startupMs,
              active: initializing === 0 ? active : 0,
            });
            while (!signal.aborted && active < concurrency.target && nextBatch < batches.length) launch();
          }
        } finally {
          if (stillInitializing) {
            initializing -= 1;
            if (initializing === 0) concurrency.settled(performance.now());
          }
          await worker?.close();
        }
      })().catch((error: unknown) => {
        if (failure !== undefined) return;
        failure = { error };
        controller.abort(error);
      }).finally(() => {
        active -= 1;
        if (!signal.aborted && nextBatch < batches.length && active < concurrency.target) launch();
      });
      tasks.push(task);
    };
    while (active < concurrency.target) launch();
    let waited = 0;
    while (waited < tasks.length) {
      const current = tasks.slice(waited);
      waited = tasks.length;
      await Promise.all(current);
    }
    if (failure !== undefined) throw failure.error;
    return paths;
  });
}
