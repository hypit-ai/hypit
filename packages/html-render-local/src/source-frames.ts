import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HtmlFrameSpan, HtmlProgram, HtmlVideoSource } from "@hypit/html-program";
import { SourceFrameStore } from "./source-frame-store.js";
import type { DecodedSourceFrame, SourceFrameWindow } from "./source-frame-store.js";

const runFile = promisify(execFile);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const preferredSourceFrames = 15;
const preferredOutputSearch = 64;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type SourceMetadata = {
  readonly width: number;
  readonly height: number;
  readonly timestamps: readonly bigint[];
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
};

type PreparedDecoder = {
  readonly id: string;
  readonly source: HtmlVideoSource;
  readonly path: string;
  readonly metadata: SourceMetadata;
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

function sourceOrdinal(source: HtmlVideoSource, sample: NonNullable<HtmlVideoSource["sourceFrames"][number]>,
  metadata: SourceMetadata): number {
  const targetNumerator = BigInt(sample.position.ticks) * BigInt(sample.position.timeBase.numerator);
  const targetDenominator = BigInt(sample.position.timeBase.denominator);
  let low = 0;
  let high = metadata.timestamps.length;
  if (source.reconstruction?.kind === "nearest") {
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const sourceNumerator = metadata.timestamps[middle]! * metadata.timeBase.numerator;
      const comparison = sourceNumerator * targetDenominator - targetNumerator * metadata.timeBase.denominator;
      if (comparison < 0n) low = middle + 1;
      else high = middle;
    }
    assert(metadata.timestamps.length > 0, `HTML Video Source ${source.id} contains no decoded frames.`);
    const upper = Math.min(metadata.timestamps.length - 1, low);
    const lower = Math.max(0, low - 1);
    const distance = (ordinal: number): bigint => {
      const sourceNumerator = metadata.timestamps[ordinal]! * metadata.timeBase.numerator;
      const difference = sourceNumerator * targetDenominator - targetNumerator * metadata.timeBase.denominator;
      return difference < 0n ? -difference : difference;
    };
    return distance(lower) <= distance(upper) ? lower : upper;
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const sourceNumerator = metadata.timestamps[middle]! * metadata.timeBase.numerator;
    const comparison = sourceNumerator * targetDenominator - targetNumerator * metadata.timeBase.denominator;
    if (sample.side === "before" ? comparison < 0n : comparison <= 0n) low = middle + 1;
    else high = middle;
  }
  assert(metadata.timestamps.length > 0, `HTML Video Source ${source.id} contains no decoded frames.`);
  return Math.max(0, Math.min(metadata.timestamps.length - 1, low - 1));
}

async function probeSource(ffprobePath: string, path: string, streamIndex: number): Promise<SourceMetadata> {
  const { stdout } = await runFile(ffprobePath, [
    "-v", "error", "-select_streams", String(streamIndex),
    "-show_entries", "stream=index,width,height,time_base:frame=best_effort_timestamp",
    "-of", "json", path,
  ], { maxBuffer: 256 * 1024 * 1024 });
  const data = JSON.parse(stdout) as {
    readonly streams?: readonly { readonly index?: unknown; readonly width?: unknown; readonly height?: unknown;
      readonly time_base?: unknown }[];
    readonly frames?: readonly { readonly best_effort_timestamp?: unknown }[];
  };
  const stream = data.streams?.[0];
  const match = typeof stream?.time_base === "string"
    ? /^(?<numerator>[1-9][0-9]*)\/(?<denominator>[1-9][0-9]*)$/u.exec(stream.time_base)
    : null;
  const timestamps = (data.frames ?? []).map((frame) => frame.best_effort_timestamp);
  assert(stream?.index === streamIndex && Number.isSafeInteger(stream.width) && Number(stream.width) > 0
    && Number.isSafeInteger(stream.height) && Number(stream.height) > 0 && match?.groups !== undefined
    && timestamps.length > 0 && timestamps.every((value) => typeof value === "number" || typeof value === "string")
    && timestamps.every((value) => /^-?[0-9]+$/u.test(String(value))),
  `HTML Video Source ${path} has no usable stream ${streamIndex}.`);
  return {
    width: Number(stream.width), height: Number(stream.height),
    timestamps: timestamps.map((value) => BigInt(String(value))),
    timeBase: { numerator: BigInt(match.groups.numerator!), denominator: BigInt(match.groups.denominator!) },
  };
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

async function* decodeSourceFrameWindow(input: {
  readonly decoder: PreparedDecoder;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly directory: string;
  readonly prefix: string;
  readonly ffmpegPath: string;
  readonly signal: AbortSignal;
}): AsyncIterable<DecodedSourceFrame> {
  input.signal.throwIfAborted();
  const count = input.window.endFrameExclusive - input.window.startFrame;
  const child = spawn(input.ffmpegPath, [
    "-v", "error", "-noautorotate", "-i", input.decoder.path,
    "-map", `0:${input.decoder.source.streamIndex}`,
    "-vf", `select=between(n\\,${input.window.startFrame}\\,${input.window.endFrameExclusive - 1}),${decodeFilters(input.decoder.source)}`,
    "-fps_mode", "passthrough", "-frames:v", String(count),
    "-q:v", "0", "-compression_level", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const abort = () => child.kill("SIGKILL");
  input.signal.addEventListener("abort", abort, { once: true });
  let diagnostic = "";
  child.stderr.on("data", (chunk: Buffer) => { diagnostic = `${diagnostic}${chunk.toString("utf8")}`.slice(-32_000); });
  const completion = new Promise<{ readonly code: number | null; readonly error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("exit", (code) => resolve({ code }));
  });
  const parser = new PngFrameParser();
  let ordinal = input.window.startFrame;
  try {
    for await (const chunk of child.stdout) for (const bytes of parser.push(chunk)) {
      assert(ordinal < input.window.endFrameExclusive,
        `Prepared Source decoder emitted too many frames for ${input.decoder.source.id}.`);
      const path = join(input.directory, `${input.decoder.id}-${input.prefix}-${ordinal}.png`);
      await writeFile(path, bytes);
      yield { frame: ordinal, path, bytes: bytes.byteLength };
      ordinal += 1;
    }
    parser.finish();
    const result = await completion;
    input.signal.throwIfAborted();
    if (result.error !== undefined) throw result.error;
    assert(result.code === 0, `Prepared Source decoder failed (${result.code ?? "signal"}): ${diagnostic.trim()}`);
    assert(ordinal === input.window.endFrameExclusive,
      `Prepared Source decoder produced ${ordinal - input.window.startFrame} of ${count} frames for ${input.decoder.source.id}.`);
  } finally {
    input.signal.removeEventListener("abort", abort);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await completion;
  }
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
  readonly directory: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly read: (source: string, outputFrame: number) => Promise<{
    readonly stream: ReturnType<typeof createReadStream>;
    readonly size: number;
    readonly release: () => Promise<void>;
  }>;
  readonly close: () => Promise<void>;
}> {
  const prepared = new Map<string, PreparedSource>();
  const decodersByKey = new Map<string, PreparedDecoder>();
  const decodersById = new Map<string, PreparedDecoder>();
  const metadata = new Map<string, Promise<SourceMetadata>>();
  await mkdir(input.directory, { recursive: true });
  for (const source of input.program.videoSources) {
    if (!source.sourceFrames.some((sample, frame) => sample !== null && selected(input.selection, frame))) continue;
    const path = input.artifactPaths.get(source.resource.address);
    assert(path !== undefined, `HTML Video Source ${source.id} has no staged resource.`);
    const metadataKey = `${path}\u0000${source.streamIndex}`;
    let metadataRequest = metadata.get(metadataKey);
    if (metadataRequest === undefined) {
      metadataRequest = probeSource(input.ffprobePath, path, source.streamIndex);
      metadata.set(metadataKey, metadataRequest);
    }
    const sourceMetadata = await metadataRequest;
    assert(sourceMetadata.width === source.interpretation.codedWidth
      && sourceMetadata.height === source.interpretation.codedHeight,
    `HTML Video Source ${source.id} coded extent differs from its closed interpretation.`);
    const outputOrdinals = new Map<number, number>();
    for (const [frame, sample] of source.sourceFrames.entries()) {
      if (sample === null || !selected(input.selection, frame)) continue;
      outputOrdinals.set(frame, sourceOrdinal(source, sample, sourceMetadata));
    }
    if (outputOrdinals.size === 0) continue;
    const decoderKey = `${metadataKey}\u0000${JSON.stringify(source.interpretation)}`;
    let decoder = decodersByKey.get(decoderKey);
    if (decoder === undefined) {
      decoder = { id: `decoded-${decodersByKey.size + 1}`, source, path, metadata: sourceMetadata };
      decodersByKey.set(decoderKey, decoder);
      decodersById.set(decoder.id, decoder);
    }
    prepared.set(source.id, { decoder, outputOrdinals });
  }

  const controller = new AbortController();
  const signal = input.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.signal]);
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
    async read(sourceId, outputFrame) {
      signal.throwIfAborted();
      const source = prepared.get(sourceId);
      assert(source !== undefined, `Prepared Source ${sourceId} is outside this render request.`);
      const ordinal = source.outputOrdinals.get(outputFrame);
      assert(ordinal !== undefined, `Prepared Source ${sourceId} does not contribute at frame ${outputFrame}.`);
      const lease = await store.acquire(
        [{ source: source.decoder.id, startFrame: ordinal, endFrameExclusive: ordinal + 1 }],
        preferredWindows(source, outputFrame),
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
      await store.close();
    },
  };
}
