import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPicturePreviewRate, isWaveformPreviewResolution, mediaPictureExtent, mediaPreviewSampleRate, waveformPeaksPerBlock,
  type MediaSourcePreviewBlock, type MediaSourcePreviewRequest, type PicturePreviewRate, type ResolvedMedia } from "@hypit/media";
import { addExactTemporalValues, compareExactTemporalValues, evaluateTemporalMap, exactTemporalRational, scaleExactTemporalValue,
  subtractExactTemporalValues, type ExactTemporalValue } from "@hypit/temporal/algebra";
import { readLocalWaveformPeaks, renderLocalMediaView } from "./derived.js";
import { pcmSampleIndex } from "./pcm-clock.js";
import type { LocalMediaToolchainOptions } from "./toolchain.js";
import { indexLocalVideoFrames, type LocalVideoFrameIndex } from "./video-frames.js";

const sampleCount = 8;
const cacheBytes = 256 * 1024 * 1024;
const sourceKeyPattern = /^[0-9a-f]{64}$/u;

type CachedBlock = MediaSourcePreviewBlock & { readonly bytes?: Uint8Array };

async function fileVersion(path: string): Promise<string> {
  const file = await stat(path, { bigint: true });
  return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":");
}

/** One project-local cache of fixed Media-clock samples. */
export class LocalMediaSourcePreviews {
  readonly #pending = new Map<string, Promise<CachedBlock>>();
  readonly #indexes = new Map<string, Promise<LocalVideoFrameIndex>>();
  readonly #lifetime = new AbortController();
  #pruning: Promise<void> | undefined;
  #pruneRequested = false;

  constructor(readonly directory: string, readonly tools: LocalMediaToolchainOptions = {}) {}

  async read(media: ResolvedMedia, request: MediaSourcePreviewRequest, signal: AbortSignal): Promise<readonly CachedBlock[]> {
    signal.throwIfAborted();
    this.#lifetime.signal.throwIfAborted();
    const version = await fileVersion(media.resource.address);
    const results = request.preset === "filmstrip" ? await this.#picture(media, version, request.positions, request.samplesPerSecond ?? 2, signal)
      : await this.#waveform(media, version, request, signal);
    signal.throwIfAborted();
    if (await fileVersion(media.resource.address) !== version) throw new Error("The source changed while reading previews.");
    return results;
  }

  async #picture(media: ResolvedMedia, version: string, positions: readonly ExactTemporalValue[],
    samplesPerSecond: PicturePreviewRate, signal: AbortSignal): Promise<readonly CachedBlock[]> {
    const picture = media.interpretation.picture;
    if (picture === undefined) throw new Error("Filmstrip preview requires an accepted Picture member.");
    if (!isPicturePreviewRate(samplesPerSecond)) throw new Error("Filmstrip preview requires a supported sampling density.");
    if (positions.length < 1 || positions.length > 64) throw new Error("Filmstrip preview requires one to 64 positions.");
    const duration = media.interpretation.domain?.duration;
    const rate = picture.kind === "constant" ? 2 : samplesPerSecond;
    const blocks = new Set<number>();
    for (const position of positions) {
      const value = exactTemporalRational(position);
      if (value.numerator < 0n) throw new Error("Source preview positions must be non-negative.");
      if (picture.kind === "constant") { blocks.add(0); continue; }
      if (duration !== undefined && compareExactTemporalValues(position, duration) < 0) {
        blocks.add(Number(value.numerator * BigInt(rate) / (value.denominator * BigInt(sampleCount))));
      }
    }
    const results: CachedBlock[] = [];
    for (const block of blocks) {
      signal.throwIfAborted();
      const identity = JSON.stringify(["picture-preview-3", version, picture, duration, rate, block]);
      const key = createHash("sha256").update(identity).digest("hex");
      let job = this.#pending.get(key);
      if (job === undefined) {
        job = this.#track(key, this.#loadPicture(key, media, version, block, rate));
      }
      results.push(await job);
    }
    return results;
  }

  #track(key: string, job: Promise<CachedBlock>): Promise<CachedBlock> {
    this.#pending.set(key, job);
    void job.finally(() => this.#pending.delete(key)).catch(() => undefined);
    return job;
  }

  async #waveform(media: ResolvedMedia, version: string, request: Extract<MediaSourcePreviewRequest, { preset: "waveform" }>,
    signal: AbortSignal): Promise<readonly CachedBlock[]> {
    const { audio, domain } = media.interpretation;
    if (audio === undefined || domain === undefined) throw new Error("Waveform preview requires a timed Audio member.");
    const { samplesPerPeak, blocks } = request;
    if (!isWaveformPreviewResolution(samplesPerPeak) || blocks.length < 1 || blocks.length > 64
      || blocks.some(block => !Number.isSafeInteger(block) || block < 0)) {
      throw new Error("Waveform preview requires a Media PCM resolution and one to 64 block indices.");
    }
    const blockSamples = samplesPerPeak * waveformPeaksPerBlock;
    const sampleCount = pcmSampleIndex(domain.duration, mediaPreviewSampleRate);
    const indices = [...new Set(blocks)].filter(index => index < sampleCount / blockSamples).sort((a, b) => a - b);
    const keys = indices.map(index => createHash("sha256").update(JSON.stringify([
      "audio-preview-1", version, audio, domain.duration, samplesPerPeak, index,
    ])).digest("hex"));
    const hits = await Promise.all(keys.map(key => this.#read(join(this.directory, key), "peaks.json")));
    signal.throwIfAborted();
    const results: (CachedBlock | Promise<CachedBlock>)[] = [];
    for (let i = 0; i < indices.length;) {
      const existing = hits[i] ?? this.#pending.get(keys[i]!);
      if (existing !== undefined) {
        results.push(existing);
        i += 1;
        continue;
      }
      let end = i + 1;
      while (end < indices.length && indices[end] === indices[end - 1]! + 1 && hits[end] === undefined
        && !this.#pending.has(keys[end]!)) end += 1;
      const batch = this.#loadWaveforms(media, version, sampleCount, samplesPerPeak, indices.slice(i, end), keys.slice(i, end));
      for (let index = i; index < end; index += 1) {
        const offset = index - i;
        results.push(this.#track(keys[index]!, batch.then(blocks => blocks[offset]!)));
      }
      i = end;
    }
    return Promise.all(results);
  }

  async #loadWaveforms(media: ResolvedMedia, version: string, totalSamples: number, samplesPerPeak: number,
    indices: readonly number[], keys: readonly string[]): Promise<readonly CachedBlock[]> {
    const signal = this.#lifetime.signal;
    signal.throwIfAborted();
    const blockSamples = samplesPerPeak * waveformPeaksPerBlock;
    const pcmTime = (sample: number): ExactTemporalValue => ({
      ticks: String(sample), timeBase: { numerator: 1, denominator: mediaPreviewSampleRate },
    });
    const rangeAt = (first: number, last: number) => ({
      start: pcmTime(first * blockSamples),
      end: last >= totalSamples / blockSamples ? media.interpretation.domain!.duration : pcmTime(last * blockSamples),
    });
    const range = rangeAt(indices[0]!, indices.at(-1)! + 1);
    const envelope = await readLocalWaveformPeaks({ media, range, samplesPerPeak, signal, tools: this.tools });
    if (await fileVersion(media.resource.address) !== version) throw new Error("The source changed while generating previews.");
    const results = await Promise.all(indices.map(async (index, offset) => {
      const firstPeak = offset * waveformPeaksPerBlock;
      const result = { range: rangeAt(index, index + 1), samplesPerPeak, bytes: Buffer.from(JSON.stringify({
        ...envelope, sampleCount: Math.min(blockSamples, envelope.sampleCount - offset * blockSamples),
        peaks: envelope.peaks.slice(firstPeak, firstPeak + waveformPeaksPerBlock),
      })) };
      await this.#store(join(this.directory, keys[offset]!), result, "peaks.json");
      return result;
    }));
    this.#schedulePrune();
    return results;
  }

  async #loadPicture(key: string, media: ResolvedMedia, version: string, block: number, rate: PicturePreviewRate): Promise<CachedBlock> {
    const signal = this.#lifetime.signal;
    signal.throwIfAborted();
    const entry = join(this.directory, key);
    const hit = await this.#read(entry, "preview.png");
    if (hit !== undefined) return hit;
    const picture = media.interpretation.picture!;
    const duration = media.interpretation.domain?.duration;
    const { widthPx, heightPx } = mediaPictureExtent(picture);
    const displayAspectRatio = widthPx / heightPx;
    const start = { ticks: String(BigInt(block) * BigInt(sampleCount)), timeBase: { numerator: 1, denominator: rate } };
    const next = addExactTemporalValues(start, { ticks: String(sampleCount), timeBase: start.timeBase });
    const range = picture.kind === "constant" ? undefined : {
      start, end: duration !== undefined && compareExactTemporalValues(duration, next) < 0 ? duration : next,
    };
    const positions = range === undefined ? undefined : Array.from({ length: sampleCount }, (_, index) => {
      const left = { ...start, ticks: String(BigInt(start.ticks) + BigInt(index)) };
      if (compareExactTemporalValues(left, range.end) >= 0) return [];
      const boundary = { ...left, ticks: String(BigInt(left.ticks) + 1n) };
      const right = compareExactTemporalValues(boundary, range.end) > 0 ? range.end : boundary;
      return [addExactTemporalValues(left, scaleExactTemporalValue(subtractExactTemporalValues(right, left),
        { numerator: 1, denominator: 2 }))];
    }).flat();
    let result: CachedBlock;
    if (positions !== undefined && picture.kind === "signal"
      && !positions.some(position => evaluateTemporalMap(picture.map, position, "after") !== undefined)) {
      result = { range: range!, positions, displayAspectRatio };
    } else {
      const rendered = await renderLocalMediaView({ media, tools: this.tools, signal,
        request: range === undefined ? { kind: "media.thumbnail", height: 384 }
          : { kind: "media.storyboard", range, frames: positions!.length, height: 384 },
        ...(positions === undefined ? {} : { storyboardPositions: positions }),
        indexVideoFrames: input => this.#index(version, input),
      });
      result = { displayAspectRatio, ...(range === undefined || positions === undefined ? {} : { range, positions }),
        ...(rendered.atlas === undefined ? {} : { atlas: rendered.atlas }), bytes: rendered.bytes };
    }
    signal.throwIfAborted();
    if (await fileVersion(media.resource.address) !== version) throw new Error("The source changed while generating previews.");
    await this.#store(entry, result, "preview.png");
    this.#schedulePrune();
    return result;
  }

  async #store(entry: string, result: CachedBlock, resource: string): Promise<void> {
    const signal = this.#lifetime.signal;
    await mkdir(this.directory, { recursive: true });
    const staged = await mkdtemp(join(this.directory, ".preview-"));
    try {
      const { bytes, ...metadata } = result;
      await writeFile(join(staged, "samples.json"), JSON.stringify({ ...metadata, hasResource: bytes !== undefined }), { signal });
      if (bytes !== undefined) await writeFile(join(staged, resource), bytes, { signal });
      signal.throwIfAborted();
      try { await rename(staged, entry); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && (error.code === "EEXIST" || error.code === "ENOTEMPTY"))) throw error;
      }
    } finally { await rm(staged, { recursive: true, force: true }); }
  }

  #schedulePrune(): void {
    this.#pruneRequested = true;
    this.#pruning ??= this.#pruneAfterWrites();
  }

  async #pruneAfterWrites(): Promise<void> {
    try {
      while (this.#pruneRequested) {
        this.#pruneRequested = false;
        await this.#prune().catch(() => undefined);
      }
    } finally { this.#pruning = undefined; }
  }

  async #read(entry: string, resource: string): Promise<CachedBlock | undefined> {
    try {
      const { hasResource, ...metadata } = JSON.parse(await readFile(join(entry, "samples.json"), "utf8")) as MediaSourcePreviewBlock & { hasResource: boolean };
      const bytes = hasResource ? await readFile(join(entry, resource)) : undefined;
      const now = new Date();
      await utimes(entry, now, now).catch(() => undefined);
      return { ...metadata, ...(bytes === undefined ? {} : { bytes }) };
    } catch { return undefined; }
  }

  #index(version: string, input: Parameters<typeof indexLocalVideoFrames>[0]): Promise<LocalVideoFrameIndex> {
    const key = JSON.stringify([version, input.stream]);
    const current = this.#indexes.get(key);
    if (current !== undefined) return current;
    const job = indexLocalVideoFrames(input);
    this.#indexes.set(key, job);
    if (this.#indexes.size > 8) this.#indexes.delete(this.#indexes.keys().next().value!);
    void job.catch(() => { if (this.#indexes.get(key) === job) this.#indexes.delete(key); });
    return job;
  }

  async #prune(): Promise<void> {
    const directories = (await readdir(this.directory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && sourceKeyPattern.test(entry.name));
    const entries = [];
    let bytes = 0;
    for (const directory of directories) {
      const path = join(this.directory, directory.name);
      const info = await stat(path).catch(() => undefined);
      if (info === undefined) continue;
      const files = await readdir(path).catch(() => []);
      const sizes = await Promise.all(files.map(file => stat(join(path, file)).catch(() => undefined)));
      const size = sizes.reduce((total, file) => total + (file?.size ?? 0), 0);
      entries.push({ path, time: info.mtimeMs, size: size + 1024 });
      bytes += size + 1024;
    }
    for (const entry of entries.sort((a, b) => a.time - b.time)) {
      if (bytes <= cacheBytes) break;
      await rm(entry.path, { recursive: true, force: true });
      bytes -= entry.size;
    }
  }

  async close(): Promise<void> {
    this.#lifetime.abort();
    await Promise.allSettled(this.#pending.values());
    await this.#pruning;
    this.#indexes.clear();
  }
}
