/** Installed inside the scene renderer; decoded samples stay in the browser. */
export async function installBrowserVideo(moduleUrl, maxBytes) {
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
  const open = (url, streamIndex, picture, geometry) => {
    const sourceKey = `${url}\u0000${streamIndex}\u0000${JSON.stringify({ picture: picture ?? null, geometry: geometry ?? null })}`;
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
          const width = geometry === undefined || geometry.rotation === 0 || geometry.rotation === 180
            ? (geometry?.codedWidth ?? track.displayWidth)
            : geometry.codedHeight;
          const height = geometry === undefined || geometry.rotation === 0 || geometry.rotation === 180
            ? (geometry?.codedHeight ?? track.displayHeight)
            : geometry.codedWidth;
          return { input, sink: new media.VideoSampleSink(track), cursors: new Map(), geometry,
            colorSpace: colorSpaceFor(picture) ?? decoderConfig?.colorSpace,
            firstTimestamp: await track.getFirstTimestamp(), timeResolution: await track.getTimeResolution(),
            width, height };
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
  const readSample = async (source, id, timestamp, endTimestamp, exactSelection) => {
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
      if (exactSelection !== undefined) {
        const ticks = Number(BigInt(exactSelection.timestampTicks));
        const numerator = Number(BigInt(exactSelection.timeBase.numerator));
        const denominator = Number(BigInt(exactSelection.timeBase.denominator));
        if (!Number.isSafeInteger(ticks) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
          || numerator <= 0 || denominator <= 0
          || Math.round(sample.timestamp * denominator / numerator) !== ticks) {
          throw new Error("Browser video decoder did not return the Programme-selected source sample");
        }
      }
      if (source.geometry !== undefined
        && (sample.codedWidth !== source.geometry.codedWidth || sample.codedHeight !== source.geometry.codedHeight)) {
        throw new Error("Browser video coded extent differs from its Programme interpretation");
      }
      // Reconstruct only when the selected source interpretation differs from
      // the decoder/container tags. PreparedVisualSource is the authority;
      // decoder metadata is merely one implementation input.
      if (/^I\d{3}A/.test(sample.format) || !colorSpaceMatches(sample, source.colorSpace)
        || (source.geometry !== undefined && sample.rotation !== source.geometry.rotation)) {
        if (sample.format === null)
          throw new Error("Browser video cannot apply the selected picture interpretation to an opaque decoder surface");
        const bytes = new Uint8Array(sample.allocationSize());
        const layout = await sample.copyTo(bytes);
        return new media.VideoSample(bytes, { format: sample.format, codedWidth: sample.codedWidth,
          codedHeight: sample.codedHeight, timestamp: sample.timestamp, duration: sample.duration,
          rotation: source.geometry?.rotation ?? sample.rotation, flip: sample.flip, visibleRect: sample.visibleRect,
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
    const sourceKeyFor = update => {
      if (update.sample === undefined)
        throw new Error("Browser video sampling metadata is missing");
      const streamIndex = update.sample.streamIndex;
      const geometry = update.sample.kind === "time" ? {
        codedWidth: update.sample.codedWidth,
        codedHeight: update.sample.codedHeight,
        sampleAspectRatio: update.sample.sampleAspectRatio,
        rotation: update.sample.rotation,
      } : undefined;
      return `${update.url}\u0000${streamIndex}\u0000${JSON.stringify({ picture: update.picture ?? null, geometry: geometry ?? null })}`;
    };
    const active = new Map(updates.map(update => [update.id, sourceKeyFor(update)]));
    const activeSourceKeys = new Set(updates.map(sourceKeyFor));
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
      const geometry = selection.kind === "time" ? {
        codedWidth: selection.codedWidth,
        codedHeight: selection.codedHeight,
        sampleAspectRatio: selection.sampleAspectRatio,
        rotation: selection.rotation,
      } : undefined;
      const opened = open(update.url, selection.streamIndex, update.picture, geometry);
      const source = await opened.pending;
      const sampleValue = selection.kind === "time" ? selection.timestampTicks : selection.frame;
      const keyFor = (value) => `${opened.sourceKey}:${selection.kind}:${value}`;
      const key = keyFor(sampleValue);
      if (!cache.has(key)) {
        if (selection.kind === "time") {
          // The Programme has already selected an exact decoded ordinal from
          // the probed PTS index. Browser decoding may realize that fact but
          // must not reinterpret a Map boundary with its own epsilon rule.
          const sample = await readSample(source, update.id, selection.timestamp, undefined, selection);
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
      const entry = cache.get(key);
      if (entry === undefined)
        throw new Error("Browser video cache lost a requested sample");
      cache.delete(key);
      cache.set(key, entry);
      const sourceWidth = source.width;
      const sourceHeight = source.height;
      const plane = document.getElementById(update.elementId);
      if (!(plane instanceof HTMLElement)
        || !plane.hasAttribute("data-hypit-media-display-plane"))
        throw new Error(`HTML Program media display plane ${update.elementId} is missing`);
      const hosts = plane.querySelectorAll(":scope > [data-hypit-media-payload-host]");
      if (hosts.length !== 1)
        throw new Error(`HTML Program media display plane ${update.elementId} has no unique payload host`);
      const slots = hosts[0].querySelectorAll(":scope > [data-hypit-decoded-media-slot]");
      if (slots.length !== 1)
        throw new Error(`HTML Program media display plane ${update.elementId} has no unique payload slot`);
      const slot = slots[0];
      let canvas = canvases.get(update.id);
      if (canvas === undefined) {
        canvas = document.createElement("canvas");
        canvas.dataset.hypitSourceFrameCanvas = update.id;
        canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none";
        slot.append(canvas);
        canvases.set(update.id, canvas);
      }
      canvas.style.display = "block";
      if (canvas.width !== sourceWidth)
        canvas.width = sourceWidth;
      if (canvas.height !== sourceHeight)
        canvas.height = sourceHeight;
      const drawStarted = performance.now();
      const context = canvas.getContext("2d");
      if (context === null)
        throw new Error("Browser video canvas could not be created");
      context.clearRect(0, 0, canvas.width, canvas.height);
      entry.sample.draw(context, 0, 0, canvas.width, canvas.height);
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

}
