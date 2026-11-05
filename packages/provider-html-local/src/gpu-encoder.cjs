const { ipcRenderer, sharedTexture, contextBridge } = require("electron");

let encoder, options, canvas, context, failure, draining, finishing = false;
let nextOrdinal = 0, accepted = 0, pendingBytes = 0, queuedBytes = 0;
const frames = new Map(), output = new Set(), capacity = new Set();
const notify = () => { for (const wake of capacity) wake(); capacity.clear(); };
function check() { if (failure) throw failure; }
function fail(error) {
  if (failure) return;
  failure = error instanceof Error ? error : new Error(String(error));
  for (const frame of frames.values()) frame.close();
  queuedBytes -= frames.size * (options?.frameBytes ?? 0);
  frames.clear(); notify();
  if (encoder?.state === "configured") encoder.close();
  ipcRenderer.send("hypit-capture-error", String(failure.stack ?? failure));
}
async function waitForCapacity(ready) {
  while (!ready()) {
    check();
    await new Promise(resolve => capacity.add(resolve));
  }
  check();
}

// Copying the completed surface lets its scene prepare another frame while the
// encoder consumes ordered snapshots. Reserve room for the next required frame.
function canAccept(ordinal) {
  const bytes = options.frameBytes;
  const used = queuedBytes + pendingBytes;
  if (ordinal === nextOrdinal) return used === 0 || used + bytes <= options.maxPendingBytes;
  return used + bytes * 2 <= options.maxPendingBytes;
}
async function reserve(ordinal) {
  while (!canAccept(ordinal)) {
    check();
    await new Promise(resolve => capacity.add(resolve));
  }
  check(); queuedBytes += options.frameBytes;
}
function drain() {
  if (draining || failure) return;
  draining = (async () => {
    while (frames.has(nextOrdinal)) {
      await waitForCapacity(() => encoder.encodeQueueSize < options.encodeCapacity
        && pendingBytes < options.maxPendingBytes);
      const frame = frames.get(nextOrdinal);
      frames.delete(nextOrdinal); queuedBytes -= options.frameBytes;
      try {
        encoder.encode(frame, { keyFrame: nextOrdinal % Math.max(1, Math.round(options.fps * 2)) === 0 });
      } finally { frame.close(); }
      nextOrdinal++; notify();
    }
  })().catch(fail).finally(() => {
    draining = undefined;
    if (!failure && frames.has(nextOrdinal)) drain();
  });
}

ipcRenderer.on("hypit-configure", async (_event, input) => {
  try {
    if (options) throw Error("GPU encoder was configured twice");
    options = { ...input, frameBytes: input.width * input.height * 4 };
    options.encodeCapacity = Math.max(1, Math.min(8, Math.floor(input.maxPendingBytes / options.frameBytes)));
    const config = { codec: "avc1.640034", width: input.width, height: input.height, bitrate: input.bitrate,
      framerate: input.fps, latencyMode: "quality", hardwareAcceleration: "prefer-hardware", avc: { format: "annexb" } };
    if (!(await VideoEncoder.isConfigSupported(config)).supported) {
      throw Error("The selected Electron/GPU does not support the requested H.264 encoding configuration");
    }
    canvas = new OffscreenCanvas(input.width, input.height);
    context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!context) throw Error("GPU encoder canvas is unavailable");
    context.imageSmoothingEnabled = false;
    encoder = new VideoEncoder({ error: fail, output(chunk) {
      if (failure) return;
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes); pendingBytes += bytes.length;
      const sent = ipcRenderer.invoke("hypit-encoded", bytes, chunk.timestamp).catch(fail).finally(() => {
        pendingBytes -= bytes.length; output.delete(sent); notify();
      });
      output.add(sent);
    } });
    encoder.addEventListener("dequeue", notify);
    encoder.configure(config);
    ipcRenderer.send("hypit-configured");
  } catch (error) { fail(error); }
});

sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture: imported }, request) => {
  let source, frame, reserved = false;
  try {
    check();
    if (!options || finishing) throw Error("GPU frame arrived outside an active export");
    if (!Number.isSafeInteger(request.ordinal) || request.ordinal < nextOrdinal
      || request.ordinal >= options.frameCount || frames.has(request.ordinal)) {
      throw Error("GPU capture delivered an unexpected output ordinal");
    }
    source = imported.getVideoFrame();
    if (!["BGRA", "BGRX", "RGBA", "RGBX"].includes(source.format)) {
      throw Error(`Unsupported shared texture pixel format: ${source.format}`);
    }
    if (source.displayWidth !== Math.max(options.width, 256) || source.displayHeight !== options.height + 8) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    const rect = { x: 0, y: options.height, width: 256, height: 8 };
    const bytes = new Uint8Array(source.allocationSize({ rect }));
    const [plane] = await source.copyTo(bytes, { rect });
    let token = 0, valid = true;
    for (let bit = 0; bit < 32; bit++) {
      const x = (bit * 8 + 4) * 4;
      const top = bytes[plane.offset + 2 * plane.stride + x], bottom = bytes[plane.offset + 6 * plane.stride + x];
      if (top > 224 && bottom < 32) token += 2 ** bit;
      else if (!(top < 32 && bottom > 224)) valid = false;
    }
    if (!valid || token !== request.token) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    await reserve(request.ordinal); reserved = true; check();
    context.drawImage(source, 0, 0, options.width, options.height, 0, 0, options.width, options.height);
    const timestamp = Math.round(request.ordinal * 1e6 / options.fps);
    const end = Math.round((request.ordinal + 1) * 1e6 / options.fps);
    frame = new VideoFrame(canvas, { timestamp, duration: end - timestamp });
    frames.set(request.ordinal, frame); frame = undefined;
    reserved = false; accepted++;
    drain();
    ipcRenderer.send("hypit-observed", request.token, true);
  } catch (error) { fail(error); }
  finally {
    if (reserved) { queuedBytes -= options.frameBytes; notify(); }
    frame?.close(); source?.close(); imported.release();
  }
});

contextBridge.exposeInMainWorld("__hypitFinishEncoding", async () => {
  check(); finishing = true;
  while (draining) await draining;
  check();
  if (frames.size || accepted !== options.frameCount || nextOrdinal !== options.frameCount) {
    throw Error("GPU encoder did not receive every output frame");
  }
  await encoder.flush(); await Promise.all(output); check(); encoder.close(); return nextOrdinal;
});
window.addEventListener("pagehide", () => {
  for (const frame of frames.values()) frame.close();
  frames.clear();
  if (encoder?.state === "configured") encoder.close();
});
window.addEventListener("DOMContentLoaded", () => ipcRenderer.send("hypit-encoder-ready"));
