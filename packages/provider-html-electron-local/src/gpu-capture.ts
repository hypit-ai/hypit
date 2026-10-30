import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow, IpcMainEvent, OffscreenSharedTexture } from "electron";
import type { Page } from "puppeteer-core";
import { selectHtmlProcessUsages } from "@hypit/html-program";
import {
  assert,
  createFramePreparer,
} from "@hypit/provider-html-local/execution";
import type {
  CaptureInput,
  SharedTextureCaptureBackend,
  SharedTextureCapturePages,
  SourceFrameUpdate,
} from "@hypit/provider-html-local/execution";

export async function gpuCapturePages({ width, height }: { width: number; height: number }) {
  const markerWidth = 32;
  const markerHeight = 2;
  const shell = `/__hypit_capture_${randomUUID()}.html`;
  const output = `/__hypit_output_${randomUUID()}.html`;
  const decoder = `/__hypit_decoder_${randomUUID()}.mjs`;
  const video = `/__hypit_video_${randomUUID()}.mjs`;
  const bundle = await readFile(fileURLToPath(new URL("../../bundles/mediabunny.min.mjs",
    import.meta.resolve("mediabunny"))), "utf8");
  const videoModule = await readFile(new URL("../runtime/browser-video.mjs", import.meta.url), "utf8");
  const html = (matte: string) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:${matte};overflow:hidden}
iframe{position:absolute;left:0;top:0;width:${width}px;height:${height}px;border:0}
canvas{position:absolute;left:0;top:${height}px;width:${markerWidth}px;height:${markerHeight}px}
</style><iframe src="/index.html"></iframe><canvas width="${markerWidth}" height="${markerHeight}"></canvas><script>
const ctx=document.querySelector('canvas').getContext('2d',{alpha:false});
window.__hypitCaptureCommit=token=>{
  for(let bit=0;bit<32;bit++){
    const white=((token>>>bit)&1)!==0;
    ctx.fillStyle=white?'#fff':'#000';ctx.fillRect(bit,0,1,1);
    ctx.fillStyle=white?'#000':'#fff';ctx.fillRect(bit,1,1,1);
  }
};
</script>`;
  return { shell, output, decoder, video, html, bundle, videoModule, markerWidth, markerHeight };
}

type PendingFrame = { token: number; ordinal: number; waitStartedAt: number; resolve(): void; reject(error: unknown): void };
type Scene = { window: BrowserWindow; pending?: PendingFrame | undefined;
  latest?: { readonly texture: OffscreenSharedTexture; readonly receivedAt: number } | undefined; busy: boolean };

/** One request owns its windows, texture references and ordered output stream. */
export async function createGpuCapture(input: CaptureInput, origin: string,
  pages: SharedTextureCapturePages, controller: AbortController, workers: number) {
  const { BrowserWindow, ipcMain, sharedTexture } = createRequire(import.meta.url)("electron") as typeof import("electron");
  assert(input.frames === undefined, "Shared-texture capture only executes encoded visual requests");
  const { config, document, delivery } = input;
  const { width, height } = document.canvas;
  const frameCount = input.range.endFrameExclusive - input.range.startFrame;
  const fps = document.frameRate.numerator / document.frameRate.denominator;
  assert(width % 2 === 0 && height % 2 === 0, "Shared-texture 4:2:0 export requires even canvas dimensions");
  assert(frameCount < 2 ** 32, "Shared-texture export exceeds the frame identifier range");
  assert(sharedTexture?.importSharedTexture !== undefined, "This Electron build does not provide sharedTexture");
  const signal = controller.signal;
  const sceneFrameRate = workers <= 1 ? 240 : workers === 2 ? 120 : 60;
  const raw = join(input.directory, "encoded.h264");
  const rawWriter = createWriteStream(raw);
  const writerClosed = finished(rawWriter).catch(() => {});
  const scenes = new Set<Scene>();
  let transferring = false;
  let closing = false, bytesWritten = 0, chunks = 0, lastTimestamp = -1;
  let paintWaitFrameMs = 0, transferMs = 0, textureTransfers = 0, rejectedTextures = 0;
  let contentOnlyTextures = 0, unrequestedTextures = 0;
  const outputWindow = new BrowserWindow({ show: false, width: 300, height: 200, webPreferences: {
    preload: fileURLToPath(new URL("../runtime/gpu-output.cjs", import.meta.url)), sandbox: false, backgroundThrottling: false,
  } });
  const fail = (error: unknown) => { if (!closing) controller.abort(error instanceof Error ? error : new Error(String(error))); };
  rawWriter.on("error", fail);
  const trusted = (event: IpcMainEvent) => event.sender === outputWindow.webContents;
  function processTexture() {
    if (closing || transferring) return;
    const scene = [...scenes].filter(item => !item.busy && item.pending !== undefined && item.latest !== undefined)
      .sort((a, b) => a.pending!.ordinal - b.pending!.ordinal)[0];
    if (scene === undefined) return;
    const latest = scene.latest!;
    scene.latest = undefined;
    scene.busy = true;
    paintWaitFrameMs += Math.max(0, latest.receivedAt - scene.pending!.waitStartedAt);
    const texture = latest.texture;
    let imported: ReturnType<typeof sharedTexture.importSharedTexture>;
    try {
      imported = sharedTexture.importSharedTexture({ textureInfo: texture.textureInfo, allReferencesReleased: () => texture.release() });
    } catch (error) { texture.release(); fail(error); return; }
    // Electron limits each native transfer handshake to one second. Submit the
    // earliest ready frame and wait for its import acknowledgement before another.
    // Snapshot copying and output preparation can continue concurrently in the receiver.
    transferring = true;
    const request = { token: scene.pending!.token, ordinal: scene.pending!.ordinal };
    const transferStarted = performance.now();
    void Promise.resolve().then(() => sharedTexture.sendSharedTexture(
      { frame: outputWindow.webContents.mainFrame, importedSharedTexture: imported }, request))
      .catch(fail).finally(() => {
        transferMs += performance.now() - transferStarted; textureTransfers++;
        imported.release(); transferring = false; processTexture();
      }).catch(fail);
  }
  const observed = (event: IpcMainEvent, token: number, accepted: boolean) => {
    if (!trusted(event) || closing) return;
    const scene = [...scenes].find(item => item.pending?.token === token);
    if (scene === undefined) return;
    scene.busy = false;
    if (accepted) {
      const pending = scene.pending!;
      scene.pending = undefined;
      scene.latest?.texture.release(); scene.latest = undefined;
      pending.resolve();
    } else {
      rejectedTextures++;
      scene.pending!.waitStartedAt = performance.now();
    }
    processTexture();
  };
  const captureError = (event: IpcMainEvent, error: string) => { if (trusted(event)) fail(new Error(error)); };
  ipcMain.on("hypit-observed", observed);
  ipcMain.on("hypit-capture-error", captureError);
  ipcMain.handle("hypit-output-batch", async (event,
    batch: Array<{ readonly bytes: Uint8Array; readonly timestamp: number }>) => {
    assert(event.sender === outputWindow.webContents, "Unexpected output sender");
    signal.throwIfAborted();
    assert(Array.isArray(batch) && batch.length > 0 && batch.length <= 8,
      "Encoder emitted an invalid output batch");
    const buffers: Buffer[] = [];
    for (const item of batch) {
      assert(item?.bytes instanceof Uint8Array && Number.isSafeInteger(item.timestamp)
        && item.timestamp > lastTimestamp && chunks < frameCount,
      "Encoder emitted an unexpected frame timestamp");
      lastTimestamp = item.timestamp; chunks++; bytesWritten += item.bytes.byteLength;
      buffers.push(Buffer.from(item.bytes.buffer, item.bytes.byteOffset, item.bytes.byteLength));
    }
    assert(bytesWritten <= config.maxRenderedBytes, "HTML renderer output exceeds its byte limit");
    const bytes = Buffer.concat(buffers);
    await new Promise<void>((resolve, reject) => rawWriter.write(bytes,
      error => error ? reject(error) : resolve()));
  });
  const closeScene = (scene: Scene) => {
    scene.pending?.reject(signal.reason ?? new Error("GPU capture closed")); scene.pending = undefined;
    scene.latest?.texture.release(); scene.latest = undefined;
    if (!scene.window.isDestroyed()) scene.window.destroy();
    scenes.delete(scene);
  };
  const close = async () => {
    if (!closing) {
      closing = true;
      signal.removeEventListener("abort", aborted);
      for (const scene of scenes) closeScene(scene);
      if (!outputWindow.isDestroyed()) outputWindow.destroy();
      ipcMain.off("hypit-observed", observed);
      ipcMain.off("hypit-capture-error", captureError);
      ipcMain.removeHandler("hypit-output-batch");
      rawWriter.destroy();
    }
    await writerClosed;
  };
  const aborted = () => { void close(); };
  signal.addEventListener("abort", aborted, { once: true });
  outputWindow.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`GPU output process exited: ${detail.reason}`)));
  outputWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const waitMessage = (channel: string) => new Promise<void>((resolve, reject) => {
    const done = (event: IpcMainEvent) => { if (trusted(event)) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => { ipcMain.off(channel, done); signal.removeEventListener("abort", abort); };
    ipcMain.on(channel, done); signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    signal.throwIfAborted();
    const ready = waitMessage("hypit-encoder-ready");
    void ready.catch(() => {});
    await outputWindow.loadURL(new URL(pages.output, origin).href);
    await ready;
    const configured = waitMessage("hypit-configured");
    void configured.catch(() => {});
    const bitrate = Math.max(64_000, Math.round({ draft: 6_000_000, standard: 12_000_000, high: 24_000_000 }[delivery.encoding.quality]
      * width * height / (1920 * 1080) * fps / 30));
    outputWindow.webContents.send("hypit-configure", {
      width, height, fps, bitrate, frameCount, maxPendingBytes: config.maxPendingFrameBytes,
      markerWidth: pages.markerWidth, markerHeight: pages.markerHeight,
      picture: delivery.picture,
    });
    await configured;
  } catch (error) { controller.abort(error); await close(); throw error; }

  return {
    async createWorker() {
      signal.throwIfAborted();
      const window = new BrowserWindow({ show: false, width: Math.max(width, pages.markerWidth), height: height + pages.markerHeight,
        useContentSize: true, backgroundColor: delivery.picture.alpha.matte, webPreferences: { backgroundThrottling: false,
          offscreen: { useSharedTexture: true, sharedTexturePixelFormat: "argb", deviceScaleFactor: 1 } } });
      const scene: Scene = { window, busy: false };
      scenes.add(scene);
      // One receiver serializes texture transfer and one encoder consumes every
      // scene. Divide the useful offscreen cadence across parallel producers;
      // higher per-scene rates only publish intermediate compositor surfaces.
      window.webContents.setFrameRate(sceneFrameRate);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`GPU scene exited: ${detail.reason}`)));
      window.webContents.on("paint", (event, dirtyRect) => {
        const texture = event.texture;
        if (texture === undefined) return;
        if (closing || texture.textureInfo.widgetType !== "frame") { texture.release(); return; }
        // Program changes can paint before the explicit commit marker reaches
        // the shared surface. Those textures cannot satisfy the pending frame and
        // must not cross the native transfer boundary. The marker dirty region is
        // the compositor's exact acknowledgement that this surface may carry it;
        // the encoded token remains the final identity check in the receiver.
        if (scene.pending === undefined) {
          unrequestedTextures++;
          texture.release();
          return;
        }
        if (dirtyRect.y + dirtyRect.height <= height || dirtyRect.y >= height + pages.markerHeight) {
          contentOnlyTextures++;
          texture.release();
          return;
        }
        scene.latest?.texture.release(); scene.latest = { texture, receivedAt: performance.now() };
        processTexture();
      });
      const sameRenderer = () => {
        const top = window.webContents.mainFrame;
        assert(top.framesInSubtree.every(frame => frame.processId === top.processId),
          "Shared-texture export requires every capture frame in the same renderer process");
      };
      await window.loadURL(new URL(pages.shell, origin).href);
      const programFrame = window.webContents.mainFrame.frames.find(frame => frame.url === new URL("index.html", origin).href);
      assert(programFrame !== undefined, "GPU capture shell did not load the HTML Program");
      sameRenderer();
      await programFrame.executeJavaScript(`__hypitFrameProgram.prepare(${JSON.stringify(input.frameSelection)})`);
      const viewport = await programFrame.executeJavaScript("({width:innerWidth,height:innerHeight})") as { width: number; height: number };
      assert(viewport.width === width && viewport.height === height, "GPU capture changed the HTML Program viewport");
      const page: Pick<Page, "evaluate" | "screenshot"> = {
        evaluate: ((fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
          programFrame.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`)) as Page["evaluate"],
        screenshot: (async (options: Parameters<Page["screenshot"]>[0] = {}) => {
          const clip = options.clip;
          assert(clip !== undefined, "Visual Process capture requires one explicit canvas clip");
          window.setBackgroundColor("#00000000");
          try {
            await new Promise<void>((resolve) => {
              const painted = (_event: unknown, dirtyRect: { readonly y: number; readonly height: number }) => {
                if (dirtyRect.y >= height || dirtyRect.y + dirtyRect.height <= 0) return;
                window.webContents.off("paint", painted);
                resolve();
              };
              window.webContents.on("paint", painted);
              window.webContents.invalidate();
            });
            const image = await window.webContents.capturePage({
              x: Math.round(clip.x), y: Math.round(clip.y),
              width: Math.round(clip.width), height: Math.round(clip.height),
            });
            return image.toPNG();
          } finally {
            window.setBackgroundColor(delivery.picture.alpha.matte);
          }
        }) as unknown as Page["screenshot"],
      };
      const prepare = await createFramePreparer(page, selectHtmlProcessUsages(document, input.frameSelection));
      await programFrame.executeJavaScript(`import(${JSON.stringify(new URL(pages.video, origin).href)})
        .then(module=>module.installBrowserVideo(${JSON.stringify(new URL(pages.decoder, origin).href)},
          ${Math.max(1, Math.floor(config.maxDecodedSourceBytes / workers))}))`);
      return {
        browserPid: window.webContents.getOSProcessId(),
        async stats() { return programFrame.executeJavaScript("__hypitVideoStats()"); },
        async releaseSources() { await programFrame.executeJavaScript("__hypitDisposeVideo()"); },
        async capture(frame: number, sources: readonly SourceFrameUpdate[], ordinal: number, prepared: () => void) {
          signal.throwIfAborted(); sameRenderer();
          const timing = await prepare(frame, sources);
          // Finish source readiness before waiting for earlier output ordinals.
          prepared();
          const started = performance.now();
          sameRenderer(); signal.throwIfAborted();
          // This local frame tree commits together. Ignore surfaces received
          // before the ready page publishes its new frame identifier.
          scene.latest?.texture.release(); scene.latest = undefined;
          const token = ordinal + 1;
          const observed = new Promise<void>((resolve, reject) => {
            scene.pending = { token, ordinal, waitStartedAt: performance.now(), resolve, reject };
          });
          void observed.catch(() => {});
          let repaint: ReturnType<typeof setInterval> | undefined;
          try {
            await programFrame.executeJavaScript(`parent.__hypitCaptureCommit(${token})`);
            processTexture();
            repaint = setInterval(() => {
              if (!closing && !scene.busy && scene.pending?.token === token) {
                void programFrame.executeJavaScript(`parent.__hypitCaptureCommit(${token})`).catch(fail);
              }
            }, 100);
            await observed;
          } finally { clearInterval(repaint); }
          return { buffer: Buffer.alloc(0), ...timing, outputMs: performance.now() - started };
        },
      };
    },
    async finish() {
      signal.throwIfAborted();
      const summary = await outputWindow.webContents.executeJavaScript("window.__hypitFinishOutput()") as {
        readonly accepted: number;
        readonly stats: Readonly<Record<string, number>>;
      };
      assert(summary.accepted === frameCount && chunks === frameCount, "GPU output process did not complete every requested frame");
      await new Promise<void>((resolve, reject) => rawWriter.end((error?: Error | null) => error ? reject(error) : resolve()));
      signal.throwIfAborted();
      return { raw, stats: { paintWaitFrameMs, transferMs, textureTransfers, rejectedTextures,
        contentOnlyTextures, unrequestedTextures, ...summary.stats } };
    },
    close,
  };
}

export const electronSharedTextureCaptureBackend: SharedTextureCaptureBackend = {
  pages: gpuCapturePages,
  create: createGpuCapture,
};
