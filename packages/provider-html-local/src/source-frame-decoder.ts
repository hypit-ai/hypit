import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, processEnvironment, runProcess } from "./process.js";
import type { DecodedSourceFrame, SourceFrameWindow } from "./source-frame-store.js";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const alphaCodecs = new Set(["vp9", "vp8", "prores"]);

export type SourceVideoMetadata = {
  readonly width: number;
  readonly height: number;
  readonly streamIndex: number;
  /** Exact presentation timestamp ticks in decode/display order for the selected stream. */
  readonly timestamps: readonly bigint[];
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
  readonly videoCodec: string;
  readonly colorSpace?: { readonly colorTransfer?: string };
};

export async function probeSourceVideo(args: {
  readonly executable: string; readonly path: string; readonly timeoutMs: number;
  readonly streamIndex: number;
  readonly maxOutputBytes: number; readonly signal?: AbortSignal;
}): Promise<SourceVideoMetadata> {
  assert(Number.isSafeInteger(args.streamIndex) && args.streamIndex >= 0, "HTML renderer source stream index is invalid");
  const result = await runProcess({ executable: args.executable, argv: ["-v", "error", "-select_streams", String(args.streamIndex),
    "-show_entries", "stream=index,width,height,codec_name,color_transfer,time_base:frame=best_effort_timestamp",
    "-of", "json", args.path],
    timeoutMs: args.timeoutMs, maxOutputBytes: args.maxOutputBytes, ...(args.signal === undefined ? {} : { signal: args.signal }) });
  const data = JSON.parse(Buffer.from(result.stdout).toString("utf8")) as {
    streams?: Array<Record<string, unknown>>;
    frames?: Array<Record<string, unknown>>;
  };
  const stream = data.streams?.[0];
  const width = Number(stream?.width), height = Number(stream?.height);
  const codec = stream?.codec_name;
  const streamIndex = Number(stream?.index);
  const timeBaseMatch = typeof stream?.time_base === "string"
    ? /^(?<numerator>-?[0-9]+)\/(?<denominator>[1-9][0-9]*)$/u.exec(stream.time_base)
    : null;
  const timeBase = timeBaseMatch?.groups === undefined ? undefined : {
    numerator: BigInt(timeBaseMatch.groups.numerator!),
    denominator: BigInt(timeBaseMatch.groups.denominator!),
  };
  const timestampValues = (data.frames ?? []).map(frame => frame.best_effort_timestamp);
  const timestamps = timestampValues.every(value => typeof value === "number" || typeof value === "string")
    && timestampValues.every(value => /^-?[0-9]+$/u.test(String(value)))
    ? timestampValues.map(value => BigInt(String(value)))
    : [];
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
    && streamIndex === args.streamIndex && timeBase !== undefined && timeBase.numerator > 0n
    && timestamps.length > 0
    && timestamps.every((timestamp, index) => index === 0 || timestamp >= timestamps[index - 1]!)
    && typeof codec === "string" && codec.length > 0, `HTML renderer source ${args.path} has no usable video stream`);
  const transfer = typeof stream?.color_transfer === "string" ? stream.color_transfer : undefined;
  return { width, height, streamIndex, timestamps, timeBase, videoCodec: codec,
    ...(transfer === undefined ? {} : { colorSpace: { colorTransfer: transfer } }) };
}

/** Incremental parser for concatenated PNGs from FFmpeg image2pipe. */
export class PngFrameParser {
  readonly #maxFrameBytes: number;
  #buffer = Buffer.alloc(0);
  #offset = 0;

  constructor(maxFrameBytes: number) {
    assert(Number.isSafeInteger(maxFrameBytes) && maxFrameBytes > 0, "PNG frame byte limit must be positive");
    this.#maxFrameBytes = maxFrameBytes;
  }

  push(chunk: Uint8Array): Buffer[] {
    if (chunk.byteLength === 0) return [];
    this.#buffer = this.#offset === 0
      ? Buffer.concat([this.#buffer, chunk])
      : Buffer.concat([this.#buffer.subarray(this.#offset), chunk]);
    this.#offset = 0;
    const frames: Buffer[] = [];
    while (true) {
      if (this.#buffer.length - this.#offset < pngSignature.length) break;
      assert(this.#buffer.subarray(this.#offset, this.#offset + pngSignature.length).equals(pngSignature),
        "FFmpeg source decoder emitted invalid PNG data");
      let cursor = this.#offset + pngSignature.length;
      let complete = false;
      while (this.#buffer.length - cursor >= 12) {
        const length = this.#buffer.readUInt32BE(cursor);
        const end = cursor + 12 + length;
        assert(end - this.#offset <= this.#maxFrameBytes, "FFmpeg decoded source PNG exceeds its frame byte limit");
        if (this.#buffer.length < end) break;
        const type = this.#buffer.toString("ascii", cursor + 4, cursor + 8);
        cursor = end;
        if (type !== "IEND") continue;
        frames.push(Buffer.from(this.#buffer.subarray(this.#offset, cursor)));
        this.#offset = cursor;
        complete = true;
        break;
      }
      if (!complete) break;
    }
    if (this.#offset > 0 && this.#offset === this.#buffer.length) {
      this.#buffer = Buffer.alloc(0);
      this.#offset = 0;
    } else {
      assert(this.#buffer.length - this.#offset <= this.#maxFrameBytes,
        "FFmpeg decoded source PNG exceeds its frame byte limit");
    }
    return frames;
  }

  finish(): void {
    assert(this.#buffer.length === this.#offset, "FFmpeg source decoder ended inside a PNG frame");
  }
}

export function sourceFrameDecodeArguments(args: {
  readonly path: string;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly metadata: SourceVideoMetadata;
  readonly platform?: NodeJS.Platform;
}): string[] {
  const count = args.window.endFrameExclusive - args.window.startFrame;
  assert(Number.isSafeInteger(args.window.startFrame) && args.window.startFrame >= 0
    && Number.isSafeInteger(count) && count > 0, "Source decode window is invalid");
  const codec = args.metadata.videoCodec.toLowerCase();
  const hdr = args.metadata.colorSpace?.colorTransfer === "smpte2084"
    || args.metadata.colorSpace?.colorTransfer === "arib-std-b67";
  const darwin = (args.platform ?? process.platform) === "darwin";
  const argv = ["-v", "error"];
  if (hdr && darwin) argv.push("-hwaccel", "videotoolbox");
  if (alphaCodecs.has(codec)) {
    argv.push("-c:v", codec === "vp9" ? "libvpx-vp9" : codec === "vp8" ? "libvpx" : codec);
  }
  argv.push("-i", args.path, "-map", `0:${args.metadata.streamIndex}`);
  const filters: string[] = [];
  if (hdr && darwin) filters.push("format=nv12");
  // HtmlProgram asks for exact source-frame ordinals. Time seeking and FPS
  // resampling reinterpret that fact as a nearby timestamp, especially at VFR
  // and PTS boundaries. Decode in stream order and select the requested ordinal
  // interval; a future fast seek may only be introduced with verified identity.
  filters.push(`select=between(n\\,${args.window.startFrame}\\,${args.window.endFrameExclusive - 1})`);
  argv.push("-vf", filters.join(","), "-fps_mode", "passthrough");
  argv.push("-frames:v", String(count), "-q:v", "0", "-compression_level", "1",
    "-f", "image2pipe", "-vcodec", "png", "pipe:1");
  return argv;
}

export async function* decodeSourceFrameWindow(args: {
  readonly executable: string;
  readonly path: string;
  readonly outputDir: string;
  readonly outputPrefix: string;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly metadata: SourceVideoMetadata;
  readonly timeoutMs: number;
  readonly maxProcessOutputBytes: number;
  readonly signal?: AbortSignal;
}): AsyncGenerator<DecodedSourceFrame> {
  args.signal?.throwIfAborted();
  const count = args.window.endFrameExclusive - args.window.startFrame;
  assert(Number.isSafeInteger(count) && count > 0, "Source decode window is empty");
  await mkdir(args.outputDir, { recursive: true });
  const argv = sourceFrameDecodeArguments(args);

  const child = spawn(args.executable, argv, {
    shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: processEnvironment(),
  });
  let stopped: Error | undefined;
  let stderr = "";
  let stderrBytes = 0;
  let closed = false;
  const stop = (error: Error) => {
    stopped ??= error;
    if (!closed) child.kill("SIGKILL");
  };
  const abort = () => stop(args.signal?.reason instanceof Error ? args.signal.reason : new Error(String(args.signal?.reason)));
  args.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => stop(new Error(`HTML renderer source decoder timed out after ${args.timeoutMs} ms`)), args.timeoutMs);
  child.stderr!.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    stderr = `${stderr}${chunk.toString()}`.slice(-32_000);
    if (stderrBytes > args.maxProcessOutputBytes) stop(new Error("HTML renderer source decoder output exceeded its byte limit"));
  });
  const outcome = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => { closed = true; resolve({ code, signal }); });
  });
  const maxFrameBytes = args.metadata.width * args.metadata.height * 10 + 64 * 1024;
  assert(Number.isSafeInteger(maxFrameBytes), "HTML renderer decoded source frame limit exceeds safe arithmetic");
  const parser = new PngFrameParser(maxFrameBytes);
  let produced = 0;
  let completed = false;
  try {
    for await (const chunk of child.stdout!) {
      for (const png of parser.push(chunk)) {
        assert(produced < count, "FFmpeg source decoder emitted too many frames");
        const frame = args.window.startFrame + produced++;
        const path = join(args.outputDir, `${args.outputPrefix}-${frame}.png`);
        await writeFile(path, png);
        yield { frame, path, bytes: png.byteLength };
      }
    }
    parser.finish();
    const result = await outcome;
    if (stopped !== undefined) throw stopped;
    args.signal?.throwIfAborted();
    assert(result.code === 0, `FFmpeg source decoder exited ${result.signal ?? `code ${String(result.code)}`}: ${stderr}`);
    assert(produced === count, `HTML renderer expected ${count} source frames, decoded ${produced}`);
    completed = true;
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener("abort", abort);
    if (!completed && !closed) child.kill("SIGKILL");
    await outcome.catch(() => {});
  }
}
