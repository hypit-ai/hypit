import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HtmlFrameSpan, HtmlProgram, HtmlVideoSource } from "@hypit/html-program";
import { indexLocalVideoFrames, localVideoFrameOrdinal, planLocalVideoFrameSeek, type LocalVideoFrameIndex } from "@hypit/media-local";
import { SourceFrameStore } from "./source-frame-store.js";
import type { DecodedSourceFrame, SourceFrameWindow } from "./source-frame-store.js";
import type { HtmlSourceFrameIndexReader } from "./types.js";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const preferredSourceFrames = 15;
const preferredOutputSearch = 64;
const maximumCachedVideos = 16;
const maximumCachedTimestamps = 1_000_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function localVideoSourceVersion(address: string): Promise<string | undefined> {
  const file = await stat(address, { bigint: true }).catch(() => undefined);
  return file === undefined ? undefined : JSON.stringify([
    address, String(file.dev), String(file.ino), String(file.size), String(file.mtimeNs), String(file.ctimeNs),
  ]);
}

/** Reuse completed indexes of unchanged videos across renders by one local Executor. */
export function createHtmlSourceFrameIndexReader(): HtmlSourceFrameIndexReader {
  const cache = new Map<string, LocalVideoFrameIndex>();
  let timestamps = 0;
  return async (input, sourceVersion) => {
    input.signal?.throwIfAborted();
    if (sourceVersion === undefined) return await indexLocalVideoFrames(input);
    const key = JSON.stringify([input.ffprobePath, input.stream, sourceVersion]);
    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const indexed = await indexLocalVideoFrames(input);
    if (indexed.timestamps.length > maximumCachedTimestamps || cache.has(key)) return indexed;
    while (cache.size >= maximumCachedVideos || timestamps + indexed.timestamps.length > maximumCachedTimestamps) {
      const oldest = cache.entries().next().value!;
      cache.delete(oldest[0]);
      timestamps -= oldest[1].timestamps.length;
    }
    cache.set(key, indexed);
    timestamps += indexed.timestamps.length;
    return indexed;
  };
}

type PreparedDecoder = {
  readonly id: string;
  readonly source: HtmlVideoSource;
  readonly path: string;
  readonly metadata: LocalVideoFrameIndex;
};

type PreparedSource = {
  readonly decoder: PreparedDecoder;
  readonly outputOrdinals: ReadonlyMap<number, number>;
};

class PngFrameParser {
  #buffer = Buffer.alloc(0);

  push(chunk: Uint8Array): Buffer[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames: Buffer[] = [];
    while (this.#buffer.length >= pngSignature.length) {
      assert(this.#buffer.subarray(0, pngSignature.length).equals(pngSignature),
        "Prepared Source decoder emitted invalid PNG data.");
      let cursor = pngSignature.length;
      let complete = false;
      while (this.#buffer.length - cursor >= 12) {
        const length = this.#buffer.readUInt32BE(cursor);
        const end = cursor + 12 + length;
        if (this.#buffer.length < end) break;
        const type = this.#buffer.toString("ascii", cursor + 4, cursor + 8);
        cursor = end;
        if (type !== "IEND") continue;
        frames.push(Buffer.from(this.#buffer.subarray(0, cursor)));
        this.#buffer = this.#buffer.subarray(cursor);
        complete = true;
        break;
      }
      if (!complete) break;
    }
    return frames;
  }

  finish(): void {
    assert(this.#buffer.length === 0, "Prepared Source decoder ended inside a PNG frame.");
  }
}

function selected(selection: readonly HtmlFrameSpan[], frame: number): boolean {
  return selection.some((span) => frame >= span.startFrame && frame < span.endFrameExclusive);
}

function decodeFilters(source: HtmlVideoSource): string {
  const picture = source.interpretation.picture;
  const rotation = source.interpretation.rotationDegrees === 0 ? ""
    : source.interpretation.rotationDegrees === 90 ? "transpose=clock,"
      : source.interpretation.rotationDegrees === 180 ? "hflip,vflip,"
        : "transpose=cclock,";
  const conversion = picture.colorMatrix === "rgb"
    ? "scale=in_range=pc:out_range=pc"
    : "scale=in_color_matrix=bt709:in_range=tv:out_range=pc";
  return `${rotation}${conversion},format=${picture.alphaMode === "opaque" ? "rgb24" : "rgba"}`;
}

type FrameDecodeInput = {
  readonly decoder: PreparedDecoder;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly directory: string;
  readonly prefix: string;
  readonly ffmpegPath: string;
  readonly signal: AbortSignal;
};

async function* runFrameDecoder(input: FrameDecodeInput,
  seek?: NonNullable<ReturnType<typeof planLocalVideoFrameSeek>>): AsyncIterable<DecodedSourceFrame> {
  input.signal.throwIfAborted();
  const count = input.window.endFrameExclusive - input.window.startFrame;
  const selection = seek === undefined
    ? `between(n\\,${input.window.startFrame}\\,${input.window.endFrameExclusive - 1})`
    : seek.selection;
  const filters = [`select=${selection}`, ...(seek === undefined ? [] : ["showinfo"]), decodeFilters(input.decoder.source)];
  const child = spawn(input.ffmpegPath, [
    "-v", seek === undefined ? "error" : "info", ...(seek?.inputArgs ?? []), "-noautorotate", "-i", input.decoder.path,
    "-map", `0:${input.decoder.source.streamIndex}`,
    "-vf", filters.join(","),
    "-fps_mode", "passthrough", "-frames:v", String(count),
    "-q:v", "0", "-compression_level", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const abort = () => child.kill("SIGKILL");
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  let diagnostic = "";
  let pendingLine = "";
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    diagnostic = `${diagnostic}${text}`.slice(-32_000);
    if (seek === undefined) return;
    const lines = `${pendingLine}${text}`.split(/\r?\n/u);
    pendingLine = lines.pop()!;
    for (const line of lines) seek.observe(line);
  });
  const completion = new Promise<{ readonly code: number | null; readonly error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });
  const parser = new PngFrameParser();
  let ordinal = input.window.startFrame;
  const staged: DecodedSourceFrame[] = [];
  let published = 0;
  try {
    for await (const chunk of child.stdout) for (const bytes of parser.push(chunk)) {
      assert(ordinal < input.window.endFrameExclusive,
        `Prepared Source decoder emitted too many frames for ${input.decoder.source.id}.`);
      const path = join(input.directory, `${input.decoder.id}-${input.prefix}-${ordinal}.png`);
      const frame = { frame: ordinal, path, bytes: bytes.byteLength };
      if (seek !== undefined) staged.push(frame);
      await writeFile(path, bytes);
      ordinal += 1;
      if (seek === undefined) yield frame;
    }
    parser.finish();
    const result = await completion;
    input.signal.throwIfAborted();
    if (result.error !== undefined) throw result.error;
    assert(result.code === 0, `Prepared Source decoder failed (${result.code ?? "signal"}): ${diagnostic.trim()}`);
    assert(ordinal === input.window.endFrameExclusive,
      `Prepared Source decoder produced ${ordinal - input.window.startFrame} of ${count} frames for ${input.decoder.source.id}.`);
    if (seek !== undefined) {
      assert(seek.verified(), "Seek decoder did not reproduce the indexed Source timestamps.");
      for (const frame of staged) {
        published += 1;
        yield frame;
      }
    }
  } finally {
    input.signal.removeEventListener("abort", abort);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await completion;
    await Promise.all(staged.slice(published).map(frame => unlink(frame.path).catch(() => undefined)));
  }
}

async function* decodeSourceFrameWindow(input: FrameDecodeInput): AsyncIterable<DecodedSourceFrame> {
  const { startFrame, endFrameExclusive } = input.window;
  const seek = planLocalVideoFrameSeek(input.decoder.metadata,
    Array.from({ length: endFrameExclusive - startFrame }, (_, offset) => startFrame + offset));
  if (seek !== undefined) {
    try {
      yield* runFrameDecoder({ ...input, prefix: `${input.prefix}-seek` }, seek);
      return;
    } catch {
      input.signal.throwIfAborted();
    }
  }
  yield* runFrameDecoder(input);
}

function preferredWindows(source: PreparedSource, outputFrame: number): SourceFrameWindow[] {
  const frames = new Set<number>();
  for (let frame = outputFrame + 1; frame <= outputFrame + preferredOutputSearch
    && frames.size < preferredSourceFrames; frame += 1) {
    const ordinal = source.outputOrdinals.get(frame);
    if (ordinal !== undefined) frames.add(ordinal);
  }
  return [...frames].map((frame) => ({ source: source.decoder.id, startFrame: frame, endFrameExclusive: frame + 1 }));
}

/** Request-private exact Source-frame preparation shared by every local HTML capture backend. */
export async function createPreparedSourceFrames(input: {
  readonly program: HtmlProgram;
  readonly selection: readonly HtmlFrameSpan[];
  readonly artifactPaths: ReadonlyMap<string, string>;
  readonly videoVersions?: ReadonlyMap<string, string>;
  readonly indexVideoFrames?: HtmlSourceFrameIndexReader;
  readonly lazy?: boolean;
  readonly directory: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly read: (source: string, outputFrame: number, requestSignal?: AbortSignal) => Promise<{
    readonly stream: ReturnType<typeof createReadStream>;
    readonly size: number;
    readonly release: () => Promise<void>;
  }>;
  readonly close: () => Promise<void>;
}> {
  const prepared = new Map<string, Promise<PreparedSource | undefined>>();
  const decodersByKey = new Map<string, PreparedDecoder>();
  const decodersById = new Map<string, PreparedDecoder>();
  const metadata = new Map<string, Promise<LocalVideoFrameIndex>>();
  const indexVideoFrames = input.indexVideoFrames ?? indexLocalVideoFrames;
  const controller = new AbortController();
  const signal = input.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.signal]);
  await mkdir(input.directory, { recursive: true });
  const sources = new Map(input.program.videoSources.map(source => [source.id, source]));
  const prepare = async (source: HtmlVideoSource): Promise<PreparedSource | undefined> => {
    signal.throwIfAborted();
    if (!source.sourceFrames.some((sample, frame) => sample !== null && selected(input.selection, frame))) return;
    const path = input.artifactPaths.get(source.resource.address);
    assert(path !== undefined, `HTML Video Source ${source.id} has no staged resource.`);
    const metadataKey = `${path}\u0000${source.streamIndex}`;
    let metadataRequest = metadata.get(metadataKey);
    if (metadataRequest === undefined) {
      const readIndex = async () => indexVideoFrames({
        ffprobePath: input.ffprobePath, address: path, stream: source.streamIndex,
        signal,
      }, input.videoVersions?.get(source.resource.address) ?? (input.lazy ? await localVideoSourceVersion(path) : undefined));
      metadataRequest = readIndex();
      metadata.set(metadataKey, metadataRequest);
    }
    const sourceMetadata = await metadataRequest;
    assert(sourceMetadata.width === source.interpretation.codedWidth
      && sourceMetadata.height === source.interpretation.codedHeight,
    `HTML Video Source ${source.id} coded extent differs from its closed interpretation.`);
    const outputOrdinals = new Map<number, number>();
    for (const [frame, sample] of source.sourceFrames.entries()) {
      if (sample === null || !selected(input.selection, frame)) continue;
      outputOrdinals.set(frame, localVideoFrameOrdinal(
        sourceMetadata, sample.position, sample.side, source.reconstruction?.kind, source.presentationStart,
      ));
    }
    if (outputOrdinals.size === 0) return;
    const decoderKey = `${metadataKey}\u0000${JSON.stringify(source.interpretation)}`;
    let decoder = decodersByKey.get(decoderKey);
    if (decoder === undefined) {
      decoder = { id: `decoded-${decodersByKey.size + 1}`, source, path, metadata: sourceMetadata };
      decodersByKey.set(decoderKey, decoder);
      decodersById.set(decoder.id, decoder);
    }
    return { decoder, outputOrdinals };
  };
  const readPrepared = (source: HtmlVideoSource) => {
    let pending = prepared.get(source.id);
    if (pending === undefined) {
      pending = prepare(source);
      prepared.set(source.id, pending);
    }
    return pending;
  };
  if (input.lazy !== true) {
    for (const source of sources.values()) await readPrepared(source);
  }
  let extraction = 0;
  const store = new SourceFrameStore({
    maxBytes: input.maxBytes,
    signal,
    decode: (source, window) => {
      const decoder = decodersById.get(source);
      assert(decoder !== undefined, `Prepared Source decoder ${source} is outside this render request.`);
      return decodeSourceFrameWindow({ decoder, window, directory: input.directory,
        prefix: String(extraction++), ffmpegPath: input.ffmpegPath, signal });
    },
    remove: async (path) => { await unlink(path).catch(() => {}); },
  });

  return {
    async read(sourceId, outputFrame, requestSignal) {
      signal.throwIfAborted();
      requestSignal?.throwIfAborted();
      const requested = sources.get(sourceId);
      const source = requested === undefined ? undefined : await readPrepared(requested);
      assert(source !== undefined, `Prepared Source ${sourceId} is outside this render request.`);
      const ordinal = source.outputOrdinals.get(outputFrame);
      assert(ordinal !== undefined, `Prepared Source ${sourceId} does not contribute at frame ${outputFrame}.`);
      const lease = await store.acquire(
        [{ source: source.decoder.id, startFrame: ordinal, endFrameExclusive: ordinal + 1 }],
        preferredWindows(source, outputFrame),
        requestSignal,
      );
      try {
        const path = store.path(source.decoder.id, ordinal);
        assert(path !== undefined, `Prepared Source ${sourceId} did not retain frame ${ordinal}.`);
        const information = await stat(path);
        let released = false;
        return {
          stream: createReadStream(path), size: information.size,
          release: async () => {
            if (released) return;
            released = true;
            lease.release();
          },
        };
      } catch (error) {
        lease.release();
        throw error;
      }
    },
    async close() {
      controller.abort(new Error("Prepared Source Frame service is closed."));
      await Promise.all([store.close(), Promise.allSettled(prepared.values())]);
    },
  };
}
