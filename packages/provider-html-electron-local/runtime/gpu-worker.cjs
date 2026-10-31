const { app } = require("electron");
const path = require("node:path");

let failed = false;
const fail = error => {
  if (failed) return;
  failed = true;
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  // The supervisor owns descendant cleanup and rejects this execution with the full error.
  if (process.connected) {
    process.send({ type: "failed", error: detail }, sendError => {
      if (sendError) app.exit(1);
    });
  } else app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

if (process.platform === "darwin") app.setActivationPolicy("accessory");
app.setPath("userData", path.join(process.argv[2], "electron"));
app.on("window-all-closed", () => {});
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("disable-gpu-vsync");
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("enable-features", "VTVideoEncodeAcceleratorOpaqueRgbSharedImageEncode");
}

// The owner can send its request before the ESM capture module has loaded.
const pending = [];
const queue = value => pending.push(value);
process.on("message", queue);
app.whenReady().then(async () => {
  if (failed) return;
  const { register } = await import("tsx/esm/api");
  register();
  const { installOwningDistributionPackageResolution } = await import("@hypit/hypit/loader/node/distribution-resolution");
  installOwningDistributionPackageResolution();
  await import(process.argv[3]);
  process.off("message", queue);
  if (failed) return;
  for (const value of pending) process.emit("message", value);
}).catch(fail);
