const { app } = require("electron");
const path = require("node:path");

if (process.platform === "darwin") app.setActivationPolicy("accessory");
app.setPath("userData", path.join(process.argv[2], "electron"));
app.on("window-all-closed", () => {});
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendSwitch("force-color-profile", "srgb");
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("enable-features", "VTVideoEncodeAcceleratorOpaqueRgbSharedImageEncode");
}

// The owner can send its request before the ESM capture module has loaded.
const pending = [];
const queue = value => pending.push(value);
process.on("message", queue);
app.whenReady().then(async () => {
  const { register } = await import("tsx/esm/api");
  register();
  await import(process.argv[3]);
  process.off("message", queue);
  for (const value of pending) process.emit("message", value);
}).catch(error => {
  console.error(error);
  if (process.connected) process.send({ type: "failed", error: String(error) });
  else app.exit(1);
});
