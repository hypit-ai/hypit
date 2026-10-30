const { ipcRenderer, sharedTexture, contextBridge } = require("electron");

let encoder, options, canvas, context, failure, draining, finishing = false;
let nextOrdinal = 0, accepted = 0, pendingBytes = 0, queuedBytes = 0;
const frames = new Map(), output = new Set(), capacity = new Set();
let outputBatch = [], outputBatchBytes = 0;
const submitted = new Map();
const timing = { tokenReadMs: 0, capacityWaitMs: 0, blitMs: 0, outputCapacityWaitMs: 0,
  outputSubmitMs: 0, encoderOutputLatencySumMs: 0, outputIpcSumMs: 0, flushMs: 0 };
let outputBatchCount = 0, outputBytes = 0, maxEncodeQueueSize = 0, maxPendingBytes = 0, maxQueuedBytes = 0;
let firstOutputSubmittedAt, lastOutputProducedAt;
const OUTPUT_BATCH_FRAMES = 8, OUTPUT_BATCH_BYTES = 1024 * 1024;
const notify = () => { for (const wake of capacity) wake(); capacity.clear(); };
function check() { if (failure) throw failure; }
function closeFrame(frame) { if (frame instanceof VideoFrame) frame.close(); }
function fail(error) {
  if (failure) return;
  failure = error instanceof Error ? error : new Error(String(error));
  for (const frame of frames.values()) closeFrame(frame);
  queuedBytes -= frames.size * (options?.frameBytes ?? 0);
  frames.clear(); notify();
  if (encoder?.state === "configured") encoder.close();
  ipcRenderer.send("hypit-capture-error", String(failure.stack ?? failure));
}
function flushOutput() {
  if (outputBatch.length === 0 || failure) return;
  const batch = outputBatch;
  const bytes = outputBatchBytes;
  outputBatch = []; outputBatchBytes = 0;
  outputBatchCount++;
  const started = performance.now();
  const sent = ipcRenderer.invoke("hypit-output-batch", batch).catch(fail).finally(() => {
    timing.outputIpcSumMs += performance.now() - started;
    pendingBytes -= bytes; output.delete(sent); notify();
  });
  output.add(sent);
}
async function waitForCapacity(ready) {
  while (!ready()) {
    check();
    await new Promise(resolve => capacity.add(resolve));
  }
  check();
}

// A completed Program frame is retained only until its absolute output
// ordinal can enter the selected encoder. No renderer or encoder fallback is
// chosen here; the request already selected one exact delivery pipeline.
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
function queueOutput(bytes, timestamp) {
  pendingBytes += bytes.byteLength; outputBytes += bytes.byteLength;
  maxPendingBytes = Math.max(maxPendingBytes, pendingBytes);
  outputBatch.push({ bytes, timestamp });
  outputBatchBytes += bytes.byteLength;
  if (outputBatch.length >= OUTPUT_BATCH_FRAMES || outputBatchBytes >= OUTPUT_BATCH_BYTES
    || pendingBytes >= options.maxPendingBytes) flushOutput();
}
function drain() {
  if (draining || failure) return;
  draining = (async () => {
    while (frames.has(nextOrdinal)) {
      const capacityStarted = performance.now();
      await waitForCapacity(() => encoder.encodeQueueSize < options.encodeCapacity
        && pendingBytes < options.maxPendingBytes);
      timing.outputCapacityWaitMs += performance.now() - capacityStarted;
      const frame = frames.get(nextOrdinal);
      frames.delete(nextOrdinal); queuedBytes -= options.frameBytes;
      const outputStarted = performance.now();
      firstOutputSubmittedAt ??= outputStarted;
      try {
        submitted.set(frame.timestamp, outputStarted);
        encoder.encode(frame, { keyFrame: nextOrdinal % Math.max(1, Math.round(options.fps * 2)) === 0 });
        maxEncodeQueueSize = Math.max(maxEncodeQueueSize, encoder.encodeQueueSize);
      } finally { frame.close(); }
      timing.outputSubmitMs += performance.now() - outputStarted;
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
    const sdr = input.picture?.colorPrimaries === "bt709" && input.picture?.colorTransfer === "bt709"
      && input.picture?.colorMatrix === "bt709" && input.picture?.colorRange === "limited"
      && input.picture?.bitDepth === 8 && input.picture?.alpha?.mode === "opaque";
    if (!sdr) throw Error("GPU encoder received an unsupported picture requirement");
    options = { ...input, frameBytes: input.width * input.height * 4 };
    options.encodeCapacity = Math.max(1, Math.min(8, Math.floor(input.maxPendingBytes / options.frameBytes)));
    const config = { codec: "avc1.640034", width: input.width, height: input.height, bitrate: input.bitrate,
      framerate: input.fps, latencyMode: "quality", hardwareAcceleration: "prefer-hardware", avc: { format: "annexb" } };
    if (!(await VideoEncoder.isConfigSupported(config)).supported)
      throw Error("The selected Electron/GPU does not support the requested H.264 encoding configuration");
    canvas = new OffscreenCanvas(input.width, input.height);
    context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!context) throw Error("GPU encoder canvas is unavailable");
    context.imageSmoothingEnabled = false;
    encoder = new VideoEncoder({ error: fail, output(chunk) {
      if (failure) return;
      lastOutputProducedAt = performance.now();
      const submittedAt = submitted.get(chunk.timestamp);
      if (submittedAt !== undefined) {
        timing.encoderOutputLatencySumMs += performance.now() - submittedAt;
        submitted.delete(chunk.timestamp);
      }
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes); queueOutput(bytes, chunk.timestamp);
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
      || request.ordinal >= options.frameCount || frames.has(request.ordinal))
      throw Error("GPU capture delivered an unexpected output ordinal");
    source = imported.getVideoFrame();
    if (!["BGRA", "BGRX", "RGBA", "RGBX"].includes(source.format))
      throw Error(`Unsupported shared texture pixel format: ${String(source.format)}`);
    if (source.displayWidth !== Math.max(options.width, options.markerWidth)
      || source.displayHeight !== options.height + options.markerHeight) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    const tokenStarted = performance.now();
    const rect = { x: 0, y: options.height, width: options.markerWidth, height: options.markerHeight };
    const bytes = new Uint8Array(source.allocationSize({ rect }));
    const [plane] = await source.copyTo(bytes, { rect });
    let token = 0, valid = true;
    for (let bit = 0; bit < 32; bit++) {
      const x = bit * 4;
      const top = bytes[plane.offset + x], bottom = bytes[plane.offset + plane.stride + x];
      if (top > 224 && bottom < 32) token += 2 ** bit;
      else if (!(top < 32 && bottom > 224)) valid = false;
    }
    timing.tokenReadMs += performance.now() - tokenStarted;
    if (!valid || token !== request.token) { ipcRenderer.send("hypit-observed", request.token, false); return; }
    const capacityStarted = performance.now();
    await reserve(request.ordinal); reserved = true; check();
    timing.capacityWaitMs += performance.now() - capacityStarted;
    maxQueuedBytes = Math.max(maxQueuedBytes, queuedBytes);
    const blitStarted = performance.now();
    // Imported SharedImages are not accepted by every hardware encoder
    // (notably macOS VideoToolbox); create an encoder-compatible surface.
    context.drawImage(source, 0, 0, options.width, options.height, 0, 0, options.width, options.height);
    const timestamp = Math.round(request.ordinal * 1e6 / options.fps);
    const end = Math.round((request.ordinal + 1) * 1e6 / options.fps);
    frame = new VideoFrame(canvas, { timestamp, duration: end - timestamp, alpha: "discard" });
    timing.blitMs += performance.now() - blitStarted;
    frames.set(request.ordinal, frame); frame = undefined;
    reserved = false; accepted++;
    drain();
    ipcRenderer.send("hypit-observed", request.token, true);
  } catch (error) { fail(error); }
  finally {
    if (reserved) { queuedBytes -= options.frameBytes; notify(); }
    closeFrame(frame); source?.close(); imported.release();
  }
});

contextBridge.exposeInMainWorld("__hypitFinishOutput", async () => {
  check(); finishing = true;
  while (draining) await draining;
  check();
  if (frames.size || accepted !== options.frameCount || nextOrdinal !== options.frameCount)
    throw Error("GPU encoder did not receive every output frame");
  const flushStarted = performance.now();
  await encoder.flush();
  timing.flushMs += performance.now() - flushStarted;
  flushOutput(); await Promise.all(output); check();
  if (encoder?.state === "configured") encoder.close();
  return { accepted: nextOrdinal, stats: { ...timing, outputBatchCount, outputBytes,
    maxEncodeQueueSize, maxPendingBytes, maxQueuedBytes,
    outputSpanMs: firstOutputSubmittedAt === undefined || lastOutputProducedAt === undefined
      ? 0 : lastOutputProducedAt - firstOutputSubmittedAt } };
});
window.addEventListener("pagehide", () => {
  for (const frame of frames.values()) closeFrame(frame);
  frames.clear();
  if (encoder?.state === "configured") encoder.close();
});
window.addEventListener("DOMContentLoaded", () => ipcRenderer.send("hypit-encoder-ready"));
