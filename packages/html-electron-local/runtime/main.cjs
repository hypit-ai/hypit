const { spawn } = require("node:child_process");
const { createWriteStream, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { app, BrowserWindow, ipcMain, sharedTexture } = require("electron");

const config = JSON.parse(readFileSync(process.env.HYPIT_ELECTRON_CONFIG || process.argv[2], "utf8"));
const markerWidth = 32;
const markerHeight = 2;
let failed = false;

function fail(error) {
  if (failed) return;
  failed = true;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
}

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
if (process.platform === "darwin") {
  app.dock?.hide();
  app.setActivationPolicy("accessory");
}
app.setPath("userData", join(dirname(config.document), "electron-profile"));
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("disable-gpu-vsync");
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("enable-features", "VTVideoEncodeAcceleratorOpaqueRgbSharedImageEncode");
}
app.on("window-all-closed", () => {});

function waitIpc(channel, trusted) {
  return new Promise((resolve) => {
    const listener = (event, ...values) => {
      if (!trusted(event)) return;
      ipcMain.off(channel, listener);
      resolve(values);
    };
    ipcMain.on(channel, listener);
  });
}

function runProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let diagnostic = "";
    child.stderr.on("data", chunk => { diagnostic += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code ?? "signal"}): ${diagnostic.trim()}`)));
  });
}

async function run() {
  if (sharedTexture?.importSharedTexture === undefined || sharedTexture?.sendSharedTexture === undefined) {
    throw new Error("This Electron executable does not provide shared-texture transfer.");
  }
  const frameCount = config.endFrameExclusive - config.startFrame;
  const fps = config.frameRate.numerator / config.frameRate.denominator;
  const raw = join(dirname(config.document), "electron-visual.h264");
  const outputDocument = join(dirname(config.document), "electron-output.html");
  writeFileSync(outputDocument, "<!doctype html><meta charset=\"utf-8\"><title>Hypit HTML output</title>", "utf8");
  const rawWriter = createWriteStream(raw);
  let rawFailure;
  rawWriter.on("error", error => { rawFailure = error; });

  const output = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    width: 320,
    height: 200,
    webPreferences: {
      preload: join(__dirname, "output.cjs"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  const trustedOutput = event => event.sender === output.webContents;
  output.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  output.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`Electron output renderer exited: ${detail.reason}.`)));
  ipcMain.handle("hypit-output-batch", async (event, batch) => {
    if (!trustedOutput(event)) throw new Error("Unexpected Electron output sender.");
    if (rawFailure !== undefined) throw rawFailure;
    if (!Array.isArray(batch) || batch.length === 0 || batch.length > 8) throw new Error("Electron output batch is invalid.");
    const buffers = batch.map(({ bytes }) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const buffer = Buffer.concat(buffers);
    await new Promise((resolve, reject) => rawWriter.write(buffer, error => error ? reject(error) : resolve()));
  });
  const outputError = (event, detail) => { if (trustedOutput(event)) fail(new Error(detail)); };
  ipcMain.on("hypit-capture-error", outputError);
  const ready = waitIpc("hypit-encoder-ready", trustedOutput);
  await output.loadFile(outputDocument);
  await ready;
  const configured = waitIpc("hypit-configured", trustedOutput);
  const bitrate = Math.max(64_000, Math.round(({ draft: 6_000_000, standard: 12_000_000, high: 24_000_000 })[config.quality]
    * config.width * config.height / (1920 * 1080) * fps / 30));
  output.webContents.send("hypit-configure", {
    width: config.width,
    height: config.height,
    fps,
    bitrate,
    frameCount,
    markerWidth,
    markerHeight,
    maxPendingBytes: 256 * 1024 * 1024,
    picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque" } },
  });
  await configured;

  const shell = join(dirname(config.document), "electron-capture.html");
  writeFileSync(shell, `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;overflow:hidden;background:#000}iframe{position:absolute;left:0;top:0;width:${config.width}px;height:${config.height}px;border:0}canvas{position:absolute;left:0;top:${config.height}px;width:${markerWidth}px;height:${markerHeight}px}
</style><iframe src=${JSON.stringify(config.url)}></iframe><canvas width="${markerWidth}" height="${markerHeight}"></canvas><script>
const context=document.querySelector('canvas').getContext('2d',{alpha:false});
window.__hypitCaptureCommit=token=>{for(let bit=0;bit<32;bit++){const white=((token>>>bit)&1)!==0;context.fillStyle=white?'#fff':'#000';context.fillRect(bit,0,1,1);context.fillStyle=white?'#000':'#fff';context.fillRect(bit,1,1,1);}};
</script>`, "utf8");

  const scene = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    width: Math.max(config.width, markerWidth),
    height: config.height + markerHeight,
    useContentSize: true,
    backgroundColor: "#000000",
    webPreferences: {
      backgroundThrottling: false,
      enableBlinkFeatures: "CanvasDrawElement",
      offscreen: { useSharedTexture: true, sharedTexturePixelFormat: "argb", deviceScaleFactor: 1 },
    },
  });
  scene.webContents.setFrameRate(240);
  scene.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  scene.webContents.on("render-process-gone", (_event, detail) => fail(new Error(`Electron scene renderer exited: ${detail.reason}.`)));
  await scene.loadURL(new URL("electron-capture.html", config.url).href);
  const documentUrl = config.url;
  const programFrame = scene.webContents.mainFrame.framesInSubtree.find(frame => frame.url === documentUrl);
  if (programFrame === undefined) throw new Error("Electron capture shell did not load the HtmlProgram.");
  await programFrame.executeJavaScript("window.__hypitUsePreparedSourceFrames('/__hypit_source')", true);
  await programFrame.executeJavaScript("window.__hypitFrameProgram.prepare()", true);

  let pending;
  let latest;
  let transferring = false;
  let awaitingObservation = false;
  const observed = (event, token, accepted) => {
    if (!trustedOutput(event) || pending?.token !== token) return;
    awaitingObservation = false;
    if (!accepted) {
      void programFrame.executeJavaScript(`parent.__hypitCaptureCommit(${token})`, true).catch(fail);
      return;
    }
    const resolve = pending.resolve;
    pending = undefined;
    resolve();
    void transferLatest().catch(fail);
  };
  ipcMain.on("hypit-observed", observed);
  async function transferLatest() {
    if (transferring || awaitingObservation || pending === undefined || latest === undefined) return;
    transferring = true;
    const texture = latest;
    latest = undefined;
    let imported;
    try {
      imported = sharedTexture.importSharedTexture({
        textureInfo: texture.textureInfo,
        allReferencesReleased: () => texture.release(),
      });
      awaitingObservation = true;
      await sharedTexture.sendSharedTexture({
        frame: output.webContents.mainFrame,
        importedSharedTexture: imported,
      }, { token: pending.token, ordinal: pending.ordinal });
    } catch (error) {
      awaitingObservation = false;
      throw error;
    } finally {
      imported?.release();
      transferring = false;
    }
  }
  scene.webContents.on("paint", (event, dirtyRect) => {
    const texture = event.texture;
    if (texture == null) return;
    if (pending === undefined || texture.textureInfo.widgetType !== "frame"
      || dirtyRect.y + dirtyRect.height <= config.height || dirtyRect.y >= config.height + markerHeight) {
      texture.release();
      return;
    }
    latest?.release();
    latest = texture;
    void transferLatest().catch(fail);
  });

  try {
    for (let ordinal = 0; ordinal < frameCount; ordinal += 1) {
      const frame = config.startFrame + ordinal;
      await programFrame.executeJavaScript(`window.__hypitFrameProgram.applyFrame(${frame})`, true);
      latest?.release();
      latest = undefined;
      const token = ordinal + 1;
      const confirmation = new Promise((resolve, reject) => { pending = { token, ordinal, resolve, reject }; });
      let repaint;
      try {
        await programFrame.executeJavaScript(`parent.__hypitCaptureCommit(${token})`, true);
        repaint = setInterval(() => {
          if (pending?.token === token && !awaitingObservation) {
            void programFrame.executeJavaScript(`parent.__hypitCaptureCommit(${token})`, true).catch(fail);
          }
        }, 100);
        await confirmation;
      } finally { clearInterval(repaint); }
      process.stdout.write(`HYPIT_PROGRESS ${ordinal + 1} ${frameCount}\n`);
    }
    const summary = await output.webContents.executeJavaScript("window.__hypitFinishOutput()", true);
    if (summary.accepted !== frameCount) throw new Error(`Electron encoded ${summary.accepted} of ${frameCount} frames.`);
    await new Promise((resolve, reject) => rawWriter.end(error => error ? reject(error) : resolve()));
    if (rawFailure !== undefined) throw rawFailure;
    await runProcess(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-fflags", "+genpts",
      "-r", `${config.frameRate.numerator}/${config.frameRate.denominator}`, "-i", raw,
      "-an", "-c:v", "copy", "-movflags", "+faststart", config.destination]);
  } finally {
    latest?.release();
    pending?.reject(new Error("Electron capture closed."));
    ipcMain.off("hypit-observed", observed);
    ipcMain.off("hypit-capture-error", outputError);
    ipcMain.removeHandler("hypit-output-batch");
    if (!scene.isDestroyed()) scene.destroy();
    if (!output.isDestroyed()) output.destroy();
  }
}

app.whenReady().then(run).then(() => app.exit(0), fail);
