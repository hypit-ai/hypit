const { readFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
const { app, BrowserWindow } = require("electron");

const config = JSON.parse(readFileSync(process.env.HYPIT_ELECTRON_CONFIG || process.argv[2], "utf8"));
let failed = false;

function fail(error) {
  if (failed) return;
  failed = true;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
}

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
if (process.platform === "darwin") app.setActivationPolicy("accessory");
app.setPath("userData", config.userData);
app.on("window-all-closed", () => {});

async function evaluate(dbg, expression) {
  const value = await dbg.sendCommand("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (value?.exceptionDetails !== undefined) {
    throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text ?? "Electron page evaluation failed.");
  }
  return value?.result?.value;
}

async function run() {
  const win = new BrowserWindow({
    show: false,
    width: config.width,
    height: config.height,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      enableBlinkFeatures: "CanvasDrawElement",
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("render-process-gone", (_event, detail) => {
    fail(new Error(`Electron capture renderer exited: ${detail.reason}.`));
  });

  await win.loadURL(config.url);
  const dbg = win.webContents.debugger;
  dbg.attach("1.3");
  await dbg.sendCommand("Page.enable");
  await dbg.sendCommand("Runtime.enable");
  await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
    width: config.width,
    height: config.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await evaluate(dbg, "window.__hypitUsePreparedSourceFrames('/__hypit_source')");
  await evaluate(dbg, `window.__hypitFrameProgram.prepare(${JSON.stringify(config.selection)})`);

  process.stdout.write("HYPIT_CAPTURE_READY\n");

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain = Promise.resolve();
  lines.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    chain = chain.then(async () => {
      const request = JSON.parse(trimmed);
      if (request.close) {
        if (!win.isDestroyed()) win.destroy();
        app.exit(0);
        return;
      }
      try {
        await evaluate(dbg, `window.__hypitFrameProgram.applyFrame(${request.frame})`);
        await dbg.sendCommand(
          "Emulation.setDefaultBackgroundColorOverride",
          request.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {},
        );
        const result = await dbg.sendCommand("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
        });
        if (typeof result?.data !== "string") throw new Error("Electron returned no frame image.");
        process.stdout.write(`HYPIT_CAPTURE_RESULT ${JSON.stringify({ id: request.id, data: result.data })}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`HYPIT_CAPTURE_RESULT ${JSON.stringify({ id: request.id, error: message })}\n`);
      }
    });
  });
  lines.on("close", () => {
    chain.finally(() => {
      if (!win.isDestroyed()) win.destroy();
      app.exit(0);
    });
  });
}

app.whenReady().then(run, fail);
