/** Installed inside the scene renderer; decoded samples stay in the browser. */
export async function installBrowserVideo(moduleUrl, maxBytes) {
  const media = await import(moduleUrl);
  const sources = new Map();
  const cache = new Map();
  let resident = 0, samplesRead = 0, decoderStarts = 0, cacheHits = 0, peak = 0;
  let sourceOpenMs = 0, sampleReadMs = 0, drawMs = 0;
  const open = (url, streamIndex) => {
    const sourceKey = `${url}\u0000${streamIndex}`;
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
            colorSpace: decoderConfig?.colorSpace,
            firstTimestamp: await track.getFirstTimestamp(), timeResolution: await track.getTimeResolution(),
            width: track.displayWidth, height: track.displayHeight };
        } catch (error) { input.dispose(); throw error; }
        finally { sourceOpenMs += performance.now() - started; }
      })();
      sources.set(sourceKey, pending);
    }
    return { sourceKey, pending };
  };
  const retain = (sourceKey, key, sample, protectedKey) => {
    const previous = cache.get(key);
    if (previous !== undefined) {
      sample.close();
      return;
    }
    const bytes = sample.allocationSize();
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
      // Planar alpha samples need the source color tags before RGB conversion.
      if (/^I\d{3}A/.test(sample.format)) {
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
    const sourceKeyFor = update => `${update.url}\u0000${update.sample?.streamIndex ?? 0}`;
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
    for (const canvas of Array.from(document.querySelectorAll("[data-hypit-source-frame-canvas]"))) {
      if (!active.has(canvas.dataset.hypitSourceFrameCanvas) && canvas.style.display !== "none") {
        canvas.style.display = "none";
        canvas.width = canvas.height = 1;
      }
    }
    for (const update of updates) {
      const selection = update.sample;
      if (selection === undefined)
        throw new Error("Browser video sampling metadata is missing");
      const opened = open(update.url, selection.streamIndex);
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
          source.sampleBytes = sample.allocationSize();
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
          source.sampleBytes = sample.allocationSize();
          retain(opened.sourceKey, keyFor(start + index), sample, key);
        }
        }
      } else cacheHits++;
      const entry = cache.get(key);
      if (entry === undefined)
        throw new Error("Browser video cache lost a requested sample");
      cache.delete(key);
      cache.set(key, entry);
      const video = document.getElementById(update.id);
      if (video === null)
        throw new Error(`HTML Program source element ${update.id} is missing`);
      let canvas = document.querySelector(`[data-hypit-source-frame-canvas="${CSS.escape(update.id)}"]`);
      if (canvas === null) {
        canvas = document.createElement("canvas");
        canvas.dataset.hypitSourceFrameCanvas = update.id;
        video.insertAdjacentElement("afterend", canvas);
      }
      canvas.className = video.className;
      canvas.style.cssText = video.style.cssText;
      canvas.style.visibility = video.dataset.hypitAuthoredVisibility ?? video.style.visibility;
      canvas.style.display = video.style.display;
      if (canvas.width !== source.width)
        canvas.width = source.width;
      if (canvas.height !== source.height)
        canvas.height = source.height;
      // Keep the compiler video at its authored style until the shared page
      // preparer records that state. The preparer hides it after this adapter
      // has copied the box onto the decoded-frame canvas.
      const context = canvas.getContext("2d");
      if (context === null)
        throw new Error("Browser video canvas could not be created");
      context.clearRect(0, 0, canvas.width, canvas.height);
      const drawStarted = performance.now();
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
