import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow, IpcMainEvent, OffscreenSharedTexture } from "electron";
import type { Page } from "puppeteer-core";
import type { CaptureInput } from "./capture.js";
import { createFramePreparer } from "./opaque-capture.js";
import type { SourceFrameUpdate } from "./opaque-capture.js";
import { assert } from "./process.js";

export async function gpuCapturePages({ width, height }: { width: number; height: number }) {
  const shell = `/__hypit_capture_${randomUUID()}.html`;
  const encoder = `/__hypit_encoder_${randomUUID()}.html`;
  const decoder = `/__hypit_decoder_${randomUUID()}.mjs`;
  const video = `/__hypit_video_${randomUUID()}.mjs`;
  const bundle = await readFile(new URL("../../bundles/mediabunny.min.mjs", import.meta.resolve("mediabunny")), "utf8");
  const videoModule = await readFile(new URL("../src/browser-video.mjs", import.meta.url), "utf8");
  const html = (matte: string) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:${matte};overflow:hidden}
iframe{position:absolute;left:0;top:0;width:${width}px;height:${height}px;border:0}
canvas{position:absolute;left:0;top:${height}px;width:256px;height:8px}
</style><iframe src="/index.html"></iframe><canvas width="256" height="8"></canvas><script>
const ctx=document.querySelector('canvas').getContext('2d',{alpha:false});
window.__hypitCaptureCommit=token=>{
  for(let bit=0;bit<32;bit++){
    const white=((token>>>bit)&1)!==0;
    ctx.fillStyle=white?'#fff':'#000';ctx.fillRect(bit*8,0,8,4);
    ctx.fillStyle=white?'#000':'#fff';ctx.fillRect(bit*8,4,8,4);
  }
};
</script>`;
  return { shell, encoder, decoder, video, html, bundle, videoModule };
}

type PendingFrame = { token: number; ordinal: number; resolve(): void; reject(error: unknown): void };
type Scene = { window: BrowserWindow; pending?: PendingFrame | undefined;
  latest?: OffscreenSharedTexture | undefined; busy: boolean };

/** One request owns its windows, texture references and ordered H.264 stream. */
export async function createGpuCapture(input: CaptureInput, origin: string,
  pages: Awaited<ReturnType<typeof gpuCapturePages>>, controller: AbortController, workers: number) {
  const { BrowserWindow, ipcMain, sharedTexture } = createRequire(import.meta.url)("electron") as typeof import("electron");
  assert(input.frames === undefined, "Shared-texture capture only executes encoded visual requests");
  const { config, document, delivery } = input;
  const { width, height } = document.canvas;
  const frameCount = input.range.endFrameExclusive - input.range.startFrame;
  const fps = document.frameRate.numerator / document.frameRate.denominator;
  assert(width % 2 === 0 && height % 2 === 0, "Shared-texture H.264 export requires even canvas dimensions");
  assert(frameCount < 2 ** 32, "Shared-texture export exceeds the frame identifier range");
  assert(sharedTexture?.importSharedTexture !== undefined, "This Electron build does not provide sharedTexture");
  const signal = controller.signal;
  const raw = join(input.directory, "encoded.h264");
  const writer = createWriteStream(raw);
  const writerClosed = finished(writer).catch(() => {});
  const scenes = new Set<Scene>();
  let transferring = false;
  let closing = false, bytesWritten = 0, chunks = 0, lastTimestamp = -1;
  const encoding = new BrowserWindow({ show: false, width: 300, height: 200, webPreferences: {
    preload: fileURLToPath(new URL("../src/gpu-encoder.cjs", import.meta.url)), sandbox: false, backgroundThrottling: false,
  } });
  const fail = (error: unknown) => { if (!closing) controller.abort(error instanceof Error ? error : new Error(String(error))); };
  writer.on("error", fail);
  const trusted = (event: IpcMainEvent) => event.sender === encoding.webContents;
  function processTexture() {
    if (closing || transferring) return;
    const scene = [...scenes].filter(item => !item.busy && item.pending !== undefined && item.latest !== undefined)
      .sort((a, b) => a.pending!.ordinal - b.pending!.ordinal)[0];
    if (scene === undefined) return;
    const texture = scene.latest!;
    scene.latest = undefined;
    scene.busy = true;
    let imported: ReturnType<typeof sharedTexture.importSharedTexture>;
    try {
      imported = sharedTexture.importSharedTexture({ textureInfo: texture.textureInfo, allReferencesReleased: () => texture.release() });
    } catch (error) { texture.release(); fail(error); return; }
    // Electron limits each native transfer handshake to one second. Submit the
    // earliest ready frame and wait for its import acknowledgement before another.
    // Snapshot copying and encoding can continue concurrently in the receiver.
    transferring = true;
    const request = { token: scene.pending!.token, ordinal: scene.pending!.ordinal };
    void Promise.resolve().then(() => sharedTexture.sendSharedTexture(
      { frame: encoding.webContents.mainFrame, importedSharedTexture: imported }, request))
      .catch(fail).finally(() => {
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
      scene.latest?.release(); scene.latest = undefined;
      pending.resolve();
    }
    processTexture();
  };
  const captureError = (event: IpcMainEvent, error: string) => { if (trusted(event)) fail(new Error(error)); };
  ipcMain.on("hypit-observed", observed);
  ipcMain.on("hypit-capture-error", captureError);
  ipcMain.handle("hypit-encoded", async (event, bytes: Uint8Array, timestamp: number) => {
    assert(event.sender === encoding.webContents, "Unexpected encoder sender");
    signal.throwIfAborted();
    assert(timestamp > lastTimestamp && chunks < frameCount, "Encoder emitted an unexpected frame timestamp");
    lastTimestamp = timestamp; chunks++; bytesWritten += bytes.byteLength;
    assert(bytesWritten <= config.maxRenderedBytes, "HTML renderer output exceeds its byte limit");
    await new Promise<void>((resolve, reject) => writer.write(Buffer.from(bytes), error => error ? reject(error) : resolve()));
  });
  const closeScene = (scene: Scene) => {
    scene.pending?.reject(signal.reason ?? new Error("GPU capture closed")); scene.pending = undefined;
    scene.latest?.release(); scene.latest = undefined;
    if (!scene.window.isDestroyed()) scene.window.destroy();
    scenes.delete(scene);
  };
  const close = async () => {
    if (!closing) {
      closing = true;
      signal.removeEventListener("abort", aborted);
      for (const scene of scenes) closeScene(scene);
      if (!encoding.isDestroyed()) encoding.destroy();
      ipcMain.off("hypit-observed", observed);
      ipcMain.off("hypit-capture-error", captureError);
      ipcMain.removeHandler("hypit-encoded");
      writer.destroy();
    }
    await writerClosed;
  };
  const aborted = () => { void close(); };
  signal.addEventListener("abort", aborted, { once: true });
  encoding.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`GPU encoder exited: ${detail.reason}`)));
  encoding.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
    await encoding.loadURL(new URL(pages.encoder, origin).href);
    await ready;
    const configured = waitMessage("hypit-configured");
    void configured.catch(() => {});
    const bitrate = Math.max(64_000, Math.round({ draft: 6_000_000, standard: 12_000_000, high: 24_000_000 }[delivery.encoding.quality]
      * width * height / (1920 * 1080) * fps / 30));
    encoding.webContents.send("hypit-configure", {
      width, height, fps, bitrate, frameCount, maxPendingBytes: config.maxPendingFrameBytes,
      picture: delivery.picture,
    });
    await configured;
  } catch (error) { controller.abort(error); await close(); throw error; }

  return {
    async createWorker() {
      signal.throwIfAborted();
      const window = new BrowserWindow({ show: false, width: Math.max(width, 256), height: height + 8,
        useContentSize: true, backgroundColor: delivery.picture.alpha.matte, webPreferences: { backgroundThrottling: false,
          offscreen: { useSharedTexture: true, sharedTexturePixelFormat: "argb", deviceScaleFactor: 1 } } });
      const scene: Scene = { window, busy: false };
      scenes.add(scene);
      window.webContents.setFrameRate(240);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`GPU scene exited: ${detail.reason}`)));
      window.webContents.on("paint", event => {
        const texture = event.texture;
        if (texture === undefined) return;
        if (closing || texture.textureInfo.widgetType !== "frame") { texture.release(); return; }
        scene.latest?.release(); scene.latest = texture;
        processTexture();
      });
      const sameRenderer = () => {
        const top = window.webContents.mainFrame;
        assert(top.framesInSubtree.every(frame => frame.processId === top.processId),
          "Shared-texture export requires child pages in the same renderer process");
      };
      await window.loadURL(new URL(pages.shell, origin).href);
      const child = window.webContents.mainFrame.frames.find(frame => frame.url === new URL("index.html", origin).href);
      assert(child !== undefined, "GPU capture shell did not load the HTML Program");
      sameRenderer();
      await child.executeJavaScript(`__hypitFrameProgram.prepare(${JSON.stringify(input.frameSelection)})`);
      const viewport = await child.executeJavaScript("({width:innerWidth,height:innerHeight})") as { width: number; height: number };
      assert(viewport.width === width && viewport.height === height, "GPU capture changed the HTML Program viewport");
      const page: Pick<Page, "evaluate"> = {
        evaluate: ((fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
          child.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`)) as Page["evaluate"],
      };
      const prepare = await createFramePreparer(page);
      await child.executeJavaScript(`import(${JSON.stringify(new URL(pages.video, origin).href)})
        .then(module=>module.installBrowserVideo(${JSON.stringify(new URL(pages.decoder, origin).href)},
          ${Math.max(1, Math.floor(config.maxDecodedSourceBytes / workers))}))`);
      return {
        browserPid: window.webContents.getOSProcessId(),
        async stats() { return child.executeJavaScript("__hypitVideoStats()"); },
        async releaseSources() { await child.executeJavaScript("__hypitDisposeVideo()"); },
        async capture(frame: number, sources: readonly SourceFrameUpdate[], ordinal: number, prepared: () => void) {
          signal.throwIfAborted(); sameRenderer();
          const timing = await prepare(frame, sources);
          // Finish source readiness before waiting for earlier output ordinals.
          prepared();
          const started = performance.now();
          sameRenderer(); signal.throwIfAborted();
          // This local frame tree commits together. Ignore surfaces received
          // before the ready page publishes its new frame identifier.
          scene.latest?.release(); scene.latest = undefined;
          const token = ordinal + 1;
          const observed = new Promise<void>((resolve, reject) => { scene.pending = { token, ordinal, resolve, reject }; });
          void observed.catch(() => {});
          let repaint: ReturnType<typeof setInterval> | undefined;
          try {
            await child.executeJavaScript(`parent.__hypitCaptureCommit(${token})`);
            processTexture();
            repaint = setInterval(() => {
              if (!closing && !scene.busy && scene.pending?.token === token) {
                void child.executeJavaScript(`parent.__hypitCaptureCommit(${token})`).catch(fail);
              }
            }, 100);
            await observed;
          } finally { clearInterval(repaint); }
          return { buffer: Buffer.alloc(0), ...timing, screenshotMs: performance.now() - started };
        },
      };
    },
    async finish() {
      signal.throwIfAborted();
      const accepted = await encoding.webContents.executeJavaScript("window.__hypitFinishEncoding()");
      assert(accepted === frameCount && chunks === frameCount, "GPU encoder did not complete every requested frame");
      await new Promise<void>((resolve, reject) => writer.end((error?: Error | null) => error ? reject(error) : resolve()));
      signal.throwIfAborted();
      return raw;
    },
    close,
  };
}
