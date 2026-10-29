/** Installed inside the scene renderer; decoded samples stay in the browser. */
export async function installBrowserVideo(moduleUrl, maxBytes, workingPicture) {
  const media = await import(moduleUrl);
  const sources = new Map();
  const cache = new Map();
  const canvases = new Map();
  let resident = 0, samplesRead = 0, decoderStarts = 0, cacheHits = 0, peak = 0;
  let sourceOpenMs = 0, sampleReadMs = 0, drawMs = 0;
  const colorSpaceFor = picture => picture === undefined ? undefined : ({
    primaries: picture.colorPrimaries === "display-p3" ? "smpte432" : picture.colorPrimaries,
    transfer: picture.colorTransfer === "srgb" ? "iec61966-2-1" : picture.colorTransfer,
    matrix: picture.colorMatrix,
    fullRange: picture.colorRange === "full",
  });
  const colorSpaceMatches = (sample, expected) => expected === undefined
    || (sample.colorSpace.primaries === expected.primaries
      && sample.colorSpace.transfer === expected.transfer
      && sample.colorSpace.matrix === expected.matrix
      && sample.colorSpace.fullRange === expected.fullRange);
  const open = (url, streamIndex, picture) => {
    const sourceKey = `${url}\u0000${streamIndex}\u0000${JSON.stringify(picture ?? null)}`;
    let pending = sources.get(sourceKey);
    if (pending === undefined) {
      pending = (async () => {
        const started = performance.now();
        const input = new media.Input({ source: new media.UrlSource(url), formats: media.ALL_FORMATS });
        try {
          const track = (await input.getTracks())[streamIndex];
          if (track === undefined || track.type !== "video" || !await track.canDecode()) {
            throw new Error(`Browser video decoder does not support stream ${streamIndex} of ${url}`);
          }
          const decoderConfig = await track.getDecoderConfig();
          return { input, sink: new media.VideoSampleSink(track), cursors: new Map(),
            colorSpace: colorSpaceFor(picture) ?? decoderConfig?.colorSpace,
            firstTimestamp: await track.getFirstTimestamp(), timeResolution: await track.getTimeResolution(),
            width: track.displayWidth, height: track.displayHeight };
        } catch (error) { input.dispose(); throw error; }
        finally { sourceOpenMs += performance.now() - started; }
      })();
      sources.set(sourceKey, pending);
    }
    return { sourceKey, pending };
  };
  const allocationSize = sample => sample.format === null
    ? sample.displayWidth * sample.displayHeight * 8
    : sample.allocationSize();
  const retain = (sourceKey, key, sample, protectedKey) => {
    const previous = cache.get(key);
    if (previous !== undefined) {
      sample.close();
      return;
    }
    const bytes = allocationSize(sample);
    while (resident + bytes > maxBytes) {
      const victim = [...cache.keys()].find(key => key !== protectedKey);
      if (victim === undefined) {
        if (key !== protectedKey) { sample.close(); return; }
        break;
      }
      const entry = cache.get(victim);
      entry.sample.close();
      resident -= entry.bytes;
      cache.delete(victim);
    }
    cache.set(key, { sourceKey, sample, bytes });
    resident += bytes;
    peak = Math.max(peak, resident);
  };
  const releaseCachedSource = (sourceKey) => {
    for (const [key, entry] of cache) {
      if (entry.sourceKey !== sourceKey) continue;
      entry.sample.close();
      resident -= entry.bytes;
      cache.delete(key);
    }
  };
  const closeCursor = async (cursor) => {
    cursor.current?.close(); cursor.next?.close();
    await cursor.iterator?.return();
  };
  const readSample = async (source, id, timestamp, endTimestamp) => {
    const started = performance.now();
    try {
      // Each layer advances independently; the source and retained samples are shared.
      let cursor = source.cursors.get(id);
      if (!cursor) { cursor = {}; source.cursors.set(id, cursor); }
      if (!cursor.iterator || timestamp < cursor.current?.timestamp || timestamp >= cursor.endTimestamp
        || timestamp - cursor.current?.timestamp > 2) {
        if (cursor.iterator) await cursor.iterator.return();
        cursor.current?.close(); cursor.next?.close();
        decoderStarts++;
        cursor.endTimestamp = endTimestamp ?? Infinity;
        cursor.iterator = source.sink.samples(timestamp, endTimestamp);
        cursor.current = (await cursor.iterator.next()).value;
        cursor.next = (await cursor.iterator.next()).value;
        if (cursor.current) samplesRead++;
        if (cursor.next) samplesRead++;
      }
      while (cursor.next && cursor.next.timestamp <= timestamp) {
        cursor.current?.close();
        cursor.current = cursor.next;
        cursor.next = (await cursor.iterator.next()).value;
        if (cursor.next) samplesRead++;
      }
      if (!cursor.current) throw new Error(`Browser video has no sample at ${timestamp}`);
      const sample = cursor.current;
      // Reconstruct only when the selected source interpretation differs from
      // the decoder/container tags. PreparedVisualSource is the authority;
      // decoder metadata is merely one implementation input.
      if (/^I\d{3}A/.test(sample.format) || !colorSpaceMatches(sample, source.colorSpace)) {
        if (sample.format === null)
          throw new Error("Browser video cannot apply the selected picture interpretation to an opaque decoder surface");
        const bytes = new Uint8Array(sample.allocationSize());
        const layout = await sample.copyTo(bytes);
        return new media.VideoSample(bytes, { format: sample.format, codedWidth: sample.codedWidth,
          codedHeight: sample.codedHeight, timestamp: sample.timestamp, duration: sample.duration,
          rotation: sample.rotation, flip: sample.flip, visibleRect: sample.visibleRect,
          displayWidth: sample.displayWidth, displayHeight: sample.displayHeight,
          colorSpace: source.colorSpace, layout });
      }
      return sample.clone();
    } finally { sampleReadMs += performance.now() - started; }
  };
  const w = window;
  w.__hypitVideoStats = () => ({ samplesRead, decoderStarts, cacheHits,
    resident, peak, cachedSamples: cache.size, openSources: sources.size,
    sourceOpenMs, sampleReadMs, drawMs });
  w.__hypitDrawVideoSources = async (updates) => {
    const targetDocument = update => {
      let target = document;
      for (const iframeId of update.documentPath) {
        const iframe = target.getElementById(iframeId);
        const view = target.defaultView;
        if (view === null || !(iframe instanceof view.HTMLIFrameElement) || iframe.contentDocument === null)
          throw new Error(`HTML Program nested document ${iframeId} is unavailable`);
        target = iframe.contentDocument;
      }
      return target;
    };
    const sourceKeyFor = update => `${update.url}\u0000${update.sample?.streamIndex ?? 0}\u0000${JSON.stringify(update.picture ?? null)}`;
    const active = new Map(updates.map(update => [update.id, sourceKeyFor(update)]));
    const activeSourceKeys = new Set(updates.filter(update => update.sample?.kind !== "i420p10").map(sourceKeyFor));
    for (const [sourceKey, pending] of sources) {
      const source = await pending;
      for (const [id, cursor] of source.cursors) {
        if (active.get(id) === sourceKey) continue;
        await closeCursor(cursor); source.cursors.delete(id);
      }
      if (!activeSourceKeys.has(sourceKey)) {
        releaseCachedSource(sourceKey);
        source.input.dispose();
        sources.delete(sourceKey);
      }
    }
    for (const [id, canvas] of canvases) {
      if (!canvas.isConnected) { canvases.delete(id); continue; }
      if (!active.has(id) && canvas.style.display !== "none") {
        canvas.style.display = "none";
        canvas.width = canvas.height = 1;
      }
    }
    for (const update of updates) {
      const selection = update.sample;
      if (selection === undefined)
        throw new Error("Browser video sampling metadata is missing");
      let entry, sourceWidth, sourceHeight, transient = false;
      if (selection.kind === "i420p10") {
        const response = await fetch(update.url);
        if (!response.ok) throw new Error(`HDR source sample ${update.url} returned ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const expected = selection.width * selection.height * 3;
        if (bytes.byteLength !== expected)
          throw new Error(`HDR source sample has ${bytes.byteLength} bytes, expected ${expected}`);
        entry = { sample: new media.VideoSample(bytes, { format: "I420P10",
          codedWidth: selection.width, codedHeight: selection.height, timestamp: 0,
          rotation: selection.rotation, colorSpace: colorSpaceFor(update.picture) }) };
        sourceWidth = entry.sample.displayWidth; sourceHeight = entry.sample.displayHeight; transient = true;
      } else {
        const opened = open(update.url, selection.streamIndex, update.picture);
        const source = await opened.pending;
        const sampleValue = selection.kind === "time" ? selection.timestamp : selection.frame;
        const keyFor = (value) => `${opened.sourceKey}:${selection.kind}:${value}:${selection.reverse ? "left" : "right"}`;
        const key = keyFor(sampleValue);
        if (!cache.has(key)) {
          if (selection.kind === "time") {
          // A reverse Map samples the interval on an exact boundary's left.
          // Move by one source time-base tick rather than an arbitrary epsilon;
          // between boundaries this remains inside the same decoded interval.
          const timestamp = selection.reverse
            ? selection.timestamp - 1 / source.timeResolution
            : selection.timestamp;
          const sample = await readSample(source, update.id, timestamp);
          source.sampleBytes = allocationSize(sample);
          retain(opened.sourceKey, key, sample, key);
          } else {
            // Reverse playback decodes a bounded forward interval, then reuses its samples.
            const count = selection.reverse ? Math.max(1, Math.min(64,
              Math.floor(maxBytes / Math.max(1, updates.length) / (source.sampleBytes ?? source.width * source.height * 4)))) : 1;
            const start = selection.reverse ? Math.max(0, selection.frame - count + 1) : selection.frame;
            const length = selection.reverse ? selection.frame - start + 1 : count;
            const timestamps = Array.from({ length }, (_, index) => source.firstTimestamp
              + (start + index + 0.5) * selection.fps.den / selection.fps.num);
            const endTimestamp = selection.reverse ? source.firstTimestamp
              + (selection.frame + 1) * selection.fps.den / selection.fps.num : undefined;
            for (let index = 0; index < timestamps.length; index++) {
              const sample = await readSample(source, update.id, timestamps[index], endTimestamp);
              source.sampleBytes = allocationSize(sample);
              retain(opened.sourceKey, keyFor(start + index), sample, key);
            }
          }
        } else cacheHits++;
        entry = cache.get(key);
        if (entry === undefined)
          throw new Error("Browser video cache lost a requested sample");
        cache.delete(key);
        cache.set(key, entry);
        sourceWidth = source.width; sourceHeight = source.height;
      }
      const owner = targetDocument(update);
      const video = owner.getElementById(update.elementId);
      if (video === null)
        throw new Error(`HTML Program source element ${update.elementId} is missing`);
      let canvas = canvases.get(update.id);
      if (canvas === undefined) {
        // Mediabunny is loaded in the root renderer realm and validates the
        // CanvasRenderingContext realm it receives. Create the drawing surface
        // in that same realm, then let the target document adopt the element;
        // its DOM placement is nested while decoder execution remains root-owned.
        canvas = document.createElement("canvas");
        canvas.dataset.hypitSourceFrameCanvas = update.id;
        video.insertAdjacentElement("afterend", canvas);
        canvases.set(update.id, canvas);
      }
      canvas.className = video.className;
      canvas.style.cssText = video.style.cssText;
      canvas.style.visibility = video.dataset.hypitAuthoredVisibility ?? video.style.visibility;
      canvas.style.display = video.style.display;
      if (canvas.width !== sourceWidth)
        canvas.width = sourceWidth;
      if (canvas.height !== sourceHeight)
        canvas.height = sourceHeight;
      // Keep the compiler video at its authored style until the shared page
      // preparer records that state. The preparer hides it after this adapter
      // has copied the box onto the decoded-frame canvas.
      const drawStarted = performance.now();
      try {
        if (workingPicture?.colorTransfer === "linear") {
          if (update.picture?.colorTransfer === "pq")
            await drawHdr10Sample(entry.sample, canvas, workingPicture.referenceWhiteNits);
          else await drawExtendedRangeSample(entry.sample, canvas);
        } else {
          const context = canvas.getContext("2d");
          if (context === null)
            throw new Error("Browser video canvas could not be created");
          context.clearRect(0, 0, canvas.width, canvas.height);
          entry.sample.draw(context, 0, 0, canvas.width, canvas.height);
        }
      } finally { if (transient) entry.sample.close(); }
      drawMs += performance.now() - drawStarted;
    }
  };
  let disposing;
  w.__hypitDisposeVideo = () => disposing ??= (async () => {
    for (const entry of cache.values()) entry.sample.close();
    cache.clear(); resident = 0;
    const pending = [...sources.values()]; sources.clear();
    await Promise.all(pending.map(async value => {
      const source = await value.catch(() => undefined);
      if (!source) return;
      try { await Promise.all([...source.cursors.values()].map(closeCursor)); }
      finally { source.input.dispose(); }
    }));
  })();
  window.addEventListener("pagehide", () => { void w.__hypitDisposeVideo().catch(() => {}); }, { once: true });

  let gpu;
  const extendedRangeGpu = async () => gpu ??= (async () => {
    if (navigator.gpu === undefined) throw new Error("HDR browser video presentation requires WebGPU");
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("HDR browser video presentation has no WebGPU adapter");
    const device = await adapter.requestDevice();
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear",
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: `
        struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
        @vertex fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
          let p = array<vec2f, 3>(vec2f(0.0, 0.0), vec2f(2.0, 0.0), vec2f(0.0, 2.0))[index];
          var out: VertexOutput;
          out.position = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
          out.uv = vec2f(p.x, 1.0 - p.y);
          return out;
        }` }), entryPoint: "main" },
      fragment: { module: device.createShaderModule({ code: `
        struct Orientation { rotation: u32, flip: u32, _pad0: u32, _pad1: u32 }
        @group(0) @binding(0) var source: texture_external;
        @group(0) @binding(1) var sourceSampler: sampler;
        @group(0) @binding(2) var<uniform> orientation: Orientation;
        fn sourceUv(displayUv: vec2f) -> vec2f {
          var p = displayUv;
          if (orientation.flip != 0u) { p.x = 1.0 - p.x; }
          if (orientation.rotation == 1u) { return vec2f(p.y, 1.0 - p.x); }
          if (orientation.rotation == 2u) { return vec2f(1.0 - p.x, 1.0 - p.y); }
          if (orientation.rotation == 3u) { return vec2f(1.0 - p.y, p.x); }
          return p;
        }
        @fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
          return textureSampleBaseClampToEdge(source, sourceSampler, sourceUv(uv));
        }` }), entryPoint: "main", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });
    const hdr10Pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: `
        struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
        @vertex fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
          let p = array<vec2f, 3>(vec2f(0.0, 0.0), vec2f(2.0, 0.0), vec2f(0.0, 2.0))[index];
          var out: VertexOutput;
          out.position = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
          out.uv = vec2f(p.x, 1.0 - p.y);
          return out;
        }` }), entryPoint: "main" },
      fragment: { module: device.createShaderModule({ code: `
        struct Params {
          yOffset: u32, yStride: u32, uOffset: u32, uStride: u32,
          vOffset: u32, vStride: u32, visibleX: u32, visibleY: u32,
          visibleWidth: u32, visibleHeight: u32, rotation: u32, flip: u32,
          sampleShift: u32, _pad0: u32, referenceWhiteNits: f32, _pad1: u32,
        }
        @group(0) @binding(0) var<storage, read> sourceWords: array<u32>;
        @group(0) @binding(1) var<uniform> params: Params;
        fn load16(index: u32) -> u32 {
          let word = sourceWords[index / 2u];
          let value = select(word & 65535u, word >> 16u, (index & 1u) != 0u);
          return value >> params.sampleShift;
        }
        fn sourceUv(displayUv: vec2f) -> vec2f {
          var p = displayUv;
          if (params.flip != 0u) { p.x = 1.0 - p.x; }
          if (params.rotation == 1u) { return vec2f(p.y, 1.0 - p.x); }
          if (params.rotation == 2u) { return vec2f(1.0 - p.x, 1.0 - p.y); }
          if (params.rotation == 3u) { return vec2f(1.0 - p.y, p.x); }
          return p;
        }
        fn pqToNits(encoded: f32) -> f32 {
          let m1 = 2610.0 / 16384.0;
          let m2 = 2523.0 / 32.0;
          let c1 = 3424.0 / 4096.0;
          let c2 = 2413.0 / 128.0;
          let c3 = 2392.0 / 128.0;
          let p = pow(clamp(encoded, 0.0, 1.0), 1.0 / m2);
          return 10000.0 * pow(max(p - c1, 0.0) / max(c2 - c3 * p, 0.000001), 1.0 / m1);
        }
        @fragment fn main(@location(0) displayUv: vec2f) -> @location(0) vec4f {
          let uv = clamp(sourceUv(displayUv), vec2f(0.0), vec2f(0.999999));
          let x = params.visibleX + min(u32(uv.x * f32(params.visibleWidth)), params.visibleWidth - 1u);
          let y = params.visibleY + min(u32(uv.y * f32(params.visibleHeight)), params.visibleHeight - 1u);
          let yCode = f32(load16(params.yOffset + y * params.yStride + x));
          let uCode = f32(load16(params.uOffset + (y / 2u) * params.uStride + x / 2u));
          let vCode = f32(load16(params.vOffset + (y / 2u) * params.vStride + x / 2u));
          let luma = clamp((yCode - 64.0) / 876.0, 0.0, 1.0);
          let cb = clamp((uCode - 512.0) / 896.0, -0.5, 0.5);
          let cr = clamp((vCode - 512.0) / 896.0, -0.5, 0.5);
          let nonlinear2020 = vec3f(luma + 1.4746 * cr,
            (luma - 0.2627 * (luma + 1.4746 * cr) - 0.0593 * (luma + 1.8814 * cb)) / 0.6780,
            luma + 1.8814 * cb);
          let linear2020 = vec3f(pqToNits(nonlinear2020.r), pqToNits(nonlinear2020.g), pqToNits(nonlinear2020.b));
          let linear709 = mat3x3f(
            1.6604910, -0.1245500, -0.0181510,
            -0.5876410, 1.1329000, -0.1005790,
            -0.0728500, -0.0083490, 1.1187300
          ) * linear2020 / params.referenceWhiteNits;
          return vec4f(linear709, 1.0);
        }` }), entryPoint: "main", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });
    return { device, sampler, pipeline, hdr10Pipeline };
  })();

  const gpuCanvases = new WeakMap();
  async function drawExtendedRangeSample(sample, canvas) {
    const { device, sampler, pipeline } = await extendedRangeGpu();
    let context = gpuCanvases.get(canvas);
    if (context === undefined) {
      context = canvas.getContext("webgpu");
      if (context === null) throw new Error("HDR browser video canvas could not create a WebGPU context");
      gpuCanvases.set(canvas, context);
    }
    context.configure({ device, format: "rgba16float", colorSpace: "srgb",
      toneMapping: { mode: "extended" }, alphaMode: "premultiplied" });
    const frame = sample.toVideoFrame();
    const orientation = device.createBuffer({ size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    try {
      device.queue.writeBuffer(orientation, 0, new Uint32Array([sample.rotation / 90, sample.flip ? 1 : 0, 0, 0]));
      const external = device.importExternalTexture({ source: frame, colorSpace: "srgb" });
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: external }, { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: orientation } },
      ] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear", storeOp: "store",
      }] });
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    } finally { orientation.destroy(); frame.close(); }
  }

  async function drawHdr10Sample(sample, canvas, referenceWhiteNits) {
    if (sample.format !== "I420P10")
      throw new Error(`HDR10 browser video requires an I420P10 decoded sample, received ${String(sample.format)}`);
    const { device, hdr10Pipeline } = await extendedRangeGpu();
    let context = gpuCanvases.get(canvas);
    if (context === undefined) {
      context = canvas.getContext("webgpu");
      if (context === null) throw new Error("HDR10 browser video canvas could not create a WebGPU context");
      gpuCanvases.set(canvas, context);
    }
    context.configure({ device, format: "rgba16float", colorSpace: "srgb",
      toneMapping: { mode: "extended" }, alphaMode: "premultiplied" });
    const raw = new Uint8Array(sample.allocationSize());
    const layout = await sample.copyTo(raw);
    if (layout.length !== 3 || layout.some(plane => plane.offset % 2 !== 0 || plane.stride % 2 !== 0))
      throw new Error("HDR10 browser video received an invalid planar sample layout");
    const padded = new Uint8Array(Math.ceil(raw.byteLength / 4) * 4);
    padded.set(raw);
    const source = device.createBuffer({ size: padded.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const params = device.createBuffer({ size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    try {
      device.queue.writeBuffer(source, 0, padded);
      const words = new Uint16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
      let maximum = 0;
      for (let index = 0; index < words.length; index++) maximum = Math.max(maximum, words[index]);
      const values = new ArrayBuffer(64);
      const view = new DataView(values);
      const integers = [layout[0].offset / 2, layout[0].stride / 2,
        layout[1].offset / 2, layout[1].stride / 2, layout[2].offset / 2, layout[2].stride / 2,
        sample.visibleRect.x, sample.visibleRect.y, sample.visibleRect.width, sample.visibleRect.height,
        sample.rotation / 90, sample.flip ? 1 : 0, maximum > 1023 ? 6 : 0, 0];
      for (let index = 0; index < integers.length; index++) view.setUint32(index * 4, integers[index], true);
      view.setFloat32(56, referenceWhiteNits, true); view.setUint32(60, 0, true);
      device.queue.writeBuffer(params, 0, values);
      const bindGroup = device.createBindGroup({ layout: hdr10Pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: params } },
      ] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear", storeOp: "store",
      }] });
      pass.setPipeline(hdr10Pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    } finally { source.destroy(); params.destroy(); }
  }
}
