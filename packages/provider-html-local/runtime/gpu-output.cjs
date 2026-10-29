const { ipcRenderer, sharedTexture, contextBridge } = require("electron");

let encoder, options, canvas, context, hdrGpu, failure, draining, finishing = false;
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
      await waitForCapacity(() => options.mode === "hdr10"
        ? pendingBytes < options.maxPendingBytes
        : encoder.encodeQueueSize < options.encodeCapacity && pendingBytes < options.maxPendingBytes);
      timing.outputCapacityWaitMs += performance.now() - capacityStarted;
      const frame = frames.get(nextOrdinal);
      frames.delete(nextOrdinal); queuedBytes -= options.frameBytes;
      const outputStarted = performance.now();
      firstOutputSubmittedAt ??= outputStarted;
      if (options.mode === "hdr10") {
        queueOutput(frame, nextOrdinal);
        lastOutputProducedAt = performance.now();
      } else {
        try {
          submitted.set(frame.timestamp, outputStarted);
          encoder.encode(frame, { keyFrame: nextOrdinal % Math.max(1, Math.round(options.fps * 2)) === 0 });
          maxEncodeQueueSize = Math.max(maxEncodeQueueSize, encoder.encodeQueueSize);
        } finally { frame.close(); }
      }
      timing.outputSubmitMs += performance.now() - outputStarted;
      nextOrdinal++; notify();
    }
  })().catch(fail).finally(() => {
    draining = undefined;
    if (!failure && frames.has(nextOrdinal)) drain();
  });
}

function isHdr10Picture(picture) {
  return picture?.colorPrimaries === "bt2020" && picture?.colorTransfer === "pq"
    && picture?.colorMatrix === "bt2020-ncl" && picture?.colorRange === "limited"
    && picture?.bitDepth === 10 && picture?.alpha?.mode === "opaque";
}

async function configureHdrGpu() {
  if (navigator.gpu === undefined) throw Error("HDR10 output transformation requires WebGPU");
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) throw Error("HDR10 output transformation has no WebGPU adapter");
  const device = await adapter.requestDevice();
  const outputBytes = options.width * options.height * 3;
  if (outputBytes > device.limits.maxStorageBufferBindingSize)
    throw Error("HDR10 output frame exceeds the selected WebGPU storage-buffer limit");
  const module = device.createShaderModule({ code: `
    struct Params { width: u32, height: u32, referenceWhiteNits: f32, _pad: u32 }
    @group(0) @binding(0) var inputPicture: texture_2d<f32>;
    @group(0) @binding(1) var<storage, read_write> outputWords: array<u32>;
    @group(0) @binding(2) var<uniform> params: Params;

    fn pq(linearNits: f32) -> f32 {
      let m1 = 2610.0 / 16384.0;
      let m2 = 2523.0 / 32.0;
      let c1 = 3424.0 / 4096.0;
      let c2 = 2413.0 / 128.0;
      let c3 = 2392.0 / 128.0;
      let p = pow(clamp(linearNits / 10000.0, 0.0, 1.0), m1);
      return pow((c1 + c2 * p) / (1.0 + c3 * p), m2);
    }
    fn nonlinear2020(x: u32, y: u32) -> vec3f {
      let rgb709 = textureLoad(inputPicture, vec2u(x, y), 0).rgb;
      let rgb2020 = mat3x3f(
        0.6274040, 0.0690970, 0.0163916,
        0.3292820, 0.9195400, 0.0880132,
        0.0433136, 0.0113612, 0.8955950
      ) * rgb709 * params.referenceWhiteNits;
      return vec3f(pq(rgb2020.r), pq(rgb2020.g), pq(rgb2020.b));
    }
    fn luma(rgb: vec3f) -> f32 { return dot(rgb, vec3f(0.2627, 0.6780, 0.0593)); }
    fn chroma(rgb: vec3f) -> vec2f {
      let y = luma(rgb);
      return vec2f((rgb.b - y) / 1.8814, (rgb.r - y) / 1.4746);
    }
    fn limitedY(value: f32) -> u32 {
      return u32(clamp(round(64.0 + 876.0 * value), 64.0, 940.0)) << 6u;
    }
    fn limitedC(value: f32) -> u32 {
      return u32(clamp(round(512.0 + 896.0 * value), 64.0, 960.0)) << 6u;
    }
    @compute @workgroup_size(8, 8)
    fn main(@builtin(global_invocation_id) gid: vec3u) {
      let x = gid.x * 2u;
      let y = gid.y;
      if (x >= params.width || y >= params.height) { return; }
      let right = min(x + 1u, params.width - 1u);
      let first = nonlinear2020(x, y);
      let second = nonlinear2020(right, y);
      let wordsPerRow = params.width / 2u;
      outputWords[y * wordsPerRow + gid.x] = limitedY(luma(first)) | (limitedY(luma(second)) << 16u);
      if ((y & 1u) == 0u) {
        let below = min(y + 1u, params.height - 1u);
        let average = (chroma(first) + chroma(second)
          + chroma(nonlinear2020(x, below)) + chroma(nonlinear2020(right, below))) * 0.25;
        let yWords = params.width * params.height / 2u;
        let uvWord = yWords + (y / 2u) * wordsPerRow + gid.x;
        outputWords[uvWord] = limitedC(average.x) | (limitedC(average.y) << 16u);
      }
    }` });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
  const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const values = new ArrayBuffer(16);
  const view = new DataView(values);
  view.setUint32(0, options.width, true); view.setUint32(4, options.height, true);
  view.setFloat32(8, options.referenceWhiteNits, true); view.setUint32(12, 0, true);
  device.queue.writeBuffer(params, 0, values);
  return { device, pipeline, params, outputBytes };
}

function halfToFloat(value) {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * fraction / 1024;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

async function hdr10Frame(source, expectedToken) {
  const { device, pipeline, params, outputBytes } = hdrGpu;
  const surfaceWidth = Math.max(options.width, options.markerWidth);
  const surfaceHeight = options.height + options.markerHeight;
  const texture = device.createTexture({ size: [surfaceWidth, surfaceHeight], format: "rgba16float",
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING
      | GPUTextureUsage.RENDER_ATTACHMENT });
  const marker = device.createBuffer({ size: 256 * options.markerHeight,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    device.queue.copyExternalImageToTexture({ source }, { texture, colorSpace: "srgb", premultipliedAlpha: true },
      [surfaceWidth, surfaceHeight]);
    const markerCommands = device.createCommandEncoder();
    markerCommands.copyTextureToBuffer({ texture, origin: { x: 0, y: options.height } },
      { buffer: marker, bytesPerRow: 256 }, [options.markerWidth, options.markerHeight]);
    device.queue.submit([markerCommands.finish()]);
    await marker.mapAsync(GPUMapMode.READ);
    const markerData = new Uint16Array(marker.getMappedRange());
    let token = 0, valid = true;
    for (let bit = 0; bit < 32; bit++) {
      const top = halfToFloat(markerData[bit * 4]);
      const bottom = halfToFloat(markerData[128 + bit * 4]);
      if (top > 0.75 && bottom < 0.25) token += 2 ** bit;
      else if (!(top < 0.25 && bottom > 0.75)) valid = false;
    }
    marker.unmap();
    if (!valid || token !== expectedToken) return undefined;

    const converted = device.createBuffer({ size: outputBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const readback = device.createBuffer({ size: outputBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: texture.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
        { binding: 1, resource: { buffer: converted } }, { binding: 2, resource: { buffer: params } },
      ] });
      const commands = device.createCommandEncoder();
      const pass = commands.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(options.width / 16), Math.ceil(options.height / 8));
      pass.end();
      commands.copyBufferToBuffer(converted, 0, readback, 0, outputBytes);
      device.queue.submit([commands.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const result = new Uint8Array(readback.getMappedRange()).slice();
      readback.unmap();
      return result;
    } finally { converted.destroy(); readback.destroy(); }
  } finally { if (marker.mapState === "mapped") marker.unmap(); marker.destroy(); texture.destroy(); }
}

ipcRenderer.on("hypit-configure", async (_event, input) => {
  try {
    if (options) throw Error("GPU encoder was configured twice");
    const hdr10 = isHdr10Picture(input.picture);
    const sdr = input.picture?.colorPrimaries === "bt709" && input.picture?.colorTransfer === "bt709"
      && input.picture?.colorMatrix === "bt709" && input.picture?.colorRange === "limited"
      && input.picture?.bitDepth === 8 && input.picture?.alpha?.mode === "opaque";
    if (!hdr10 && !sdr) throw Error("GPU encoder received an unsupported picture requirement");
    if (input.mode !== (hdr10 ? "hdr10" : "sdr")) throw Error("GPU encoder pipeline differs from its delivery picture");
    options = { ...input, frameBytes: input.width * input.height * (hdr10 ? 3 : 4) };
    options.encodeCapacity = Math.max(1, Math.min(8, Math.floor(input.maxPendingBytes / options.frameBytes)));
    if (hdr10) {
      if (!Number.isFinite(input.referenceWhiteNits) || input.referenceWhiteNits <= 0)
        throw Error("HDR10 output requires a positive authored reference white");
      hdrGpu = await configureHdrGpu();
    } else {
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
    }
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
    if (options.mode === "hdr10" ? source.format !== null : !["BGRA", "BGRX", "RGBA", "RGBX"].includes(source.format))
      throw Error(`Unsupported shared texture pixel format: ${String(source.format)}`);
    if (source.displayWidth !== Math.max(options.width, options.markerWidth)
      || source.displayHeight !== options.height + options.markerHeight) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    let payload;
    const tokenStarted = performance.now();
    if (options.mode === "hdr10") {
      payload = await hdr10Frame(source, request.token);
    } else {
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
      if (valid && token === request.token) payload = true;
    }
    timing.tokenReadMs += performance.now() - tokenStarted;
    if (payload === undefined) { ipcRenderer.send("hypit-observed", request.token, false); return; }
    const capacityStarted = performance.now();
    await reserve(request.ordinal); reserved = true; check();
    timing.capacityWaitMs += performance.now() - capacityStarted;
    maxQueuedBytes = Math.max(maxQueuedBytes, queuedBytes);
    const blitStarted = performance.now();
    if (options.mode === "hdr10") frame = payload;
    else {
      // Imported SharedImages are not accepted by every hardware encoder
      // (notably macOS VideoToolbox); create an encoder-compatible surface.
      context.drawImage(source, 0, 0, options.width, options.height, 0, 0, options.width, options.height);
      const timestamp = Math.round(request.ordinal * 1e6 / options.fps);
      const end = Math.round((request.ordinal + 1) * 1e6 / options.fps);
      frame = new VideoFrame(canvas, { timestamp, duration: end - timestamp, alpha: "discard" });
    }
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
  if (options.mode === "sdr") await encoder.flush();
  timing.flushMs += performance.now() - flushStarted;
  flushOutput(); await Promise.all(output); check();
  if (encoder?.state === "configured") encoder.close();
  hdrGpu?.params.destroy();
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
