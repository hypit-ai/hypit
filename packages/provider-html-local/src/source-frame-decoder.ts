import type { PictureInterpretation } from "@hypit/media";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, processEnvironment, runProcess } from "./process.js";
import type { DecodedSourceFrame, SourceFrameWindow } from "./source-frame-store.js";

const alphaCodecs = new Set(["vp9", "vp8", "prores"]);

export type SourceVideoMetadata = {
  readonly width: number;
  readonly height: number;
  readonly streamIndex: number;
  /** Exact presentation timestamp ticks in decode/display order for the selected stream. */
  readonly timestamps: readonly bigint[];
  readonly endTimestamp: bigint;
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
  readonly videoCodec: string;
};

export async function probeSourceVideo(args: {
  readonly executable: string; readonly path: string; readonly timeoutMs: number;
  readonly streamIndex: number;
  readonly maxOutputBytes: number; readonly signal?: AbortSignal;
}): Promise<SourceVideoMetadata> {
  assert(Number.isSafeInteger(args.streamIndex) && args.streamIndex >= 0, "HTML renderer source stream index is invalid");
  const result = await runProcess({ executable: args.executable, argv: ["-v", "error", "-select_streams", String(args.streamIndex),
    "-show_entries", "stream=index,width,height,codec_name,time_base,start_pts,duration_ts:frame=best_effort_timestamp,duration,pkt_duration",
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
  const finalFrame = data.frames?.at(-1);
  const durationValue = finalFrame?.duration ?? finalFrame?.pkt_duration;
  const duration = /^(?:[1-9][0-9]*)$/u.test(String(durationValue)) ? BigInt(String(durationValue)) : undefined;
  const streamStart = /^-?[0-9]+$/u.test(String(stream?.start_pts)) ? BigInt(String(stream!.start_pts)) : undefined;
  const streamDuration = /^[1-9][0-9]*$/u.test(String(stream?.duration_ts)) ? BigInt(String(stream!.duration_ts)) : undefined;
  const endTimestamp = duration !== undefined && timestamps.length > 0 ? timestamps.at(-1)! + duration
    : streamStart !== undefined && streamDuration !== undefined ? streamStart + streamDuration : undefined;
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
    && streamIndex === args.streamIndex && timeBase !== undefined && timeBase.numerator > 0n
    && timestamps.length > 0
    && timestamps.every((timestamp, index) => index === 0 || timestamp > timestamps[index - 1]!)
    && endTimestamp !== undefined && endTimestamp > timestamps.at(-1)!
    && typeof codec === "string" && codec.length > 0, `HTML renderer source ${args.path} has no usable video stream`);
  return { width, height, streamIndex, timestamps, endTimestamp, timeBase, videoCodec: codec };
}

class FixedFrameParser {
  readonly #frameBytes: number;
  #buffer: Buffer | undefined;
  #filled = 0;

  constructor(frameBytes: number) {
    assert(Number.isSafeInteger(frameBytes) && frameBytes > 0, "Raw frame byte size must be positive");
    this.#frameBytes = frameBytes;
  }

  push(chunk: Uint8Array): Buffer[] {
    const frames: Buffer[] = [];
    for (let offset = 0; offset < chunk.byteLength;) {
      this.#buffer ??= Buffer.allocUnsafe(this.#frameBytes);
      const length = Math.min(chunk.byteLength - offset, this.#frameBytes - this.#filled);
      this.#buffer.set(chunk.subarray(offset, offset + length), this.#filled);
      offset += length;
      this.#filled += length;
      if (this.#filled === this.#frameBytes) {
        frames.push(this.#buffer);
        this.#buffer = undefined;
        this.#filled = 0;
      }
    }
    return frames;
  }

  finish(): void {
    assert(this.#filled === 0, "FFmpeg source decoder ended inside a raw frame");
  }
}

export function sourceFrameDecodeArguments(args: {
  readonly path: string;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly metadata: SourceVideoMetadata;
  readonly picture?: PictureInterpretation;
}, output: "rgba8" | "i420p10" = "rgba8"): string[] {
  const count = args.window.endFrameExclusive - args.window.startFrame;
  assert(Number.isSafeInteger(args.window.startFrame) && args.window.startFrame >= 0
    && Number.isSafeInteger(count) && count > 0, "Source decode window is invalid");
  const codec = args.metadata.videoCodec.toLowerCase();
  const argv = ["-v", "error", "-noautorotate"];
  if (alphaCodecs.has(codec)) {
    argv.push("-c:v", codec === "vp9" ? "libvpx-vp9" : codec === "vp8" ? "libvpx" : codec);
  }
  argv.push("-i", args.path, "-map", `0:${args.metadata.streamIndex}`);
  const filters: string[] = [];
  // HtmlProgram asks for exact source-frame ordinals. Time seeking and FPS
  // resampling reinterpret that fact as a nearby timestamp, especially at VFR
  // and PTS boundaries. Decode in stream order and select the requested ordinal
  // interval; a future fast seek may only be introduced with verified identity.
  filters.push(`select=between(n\\,${args.window.startFrame}\\,${args.window.endFrameExclusive - 1})`);
  if (output === "rgba8") {
    if (args.picture === undefined) filters.push("scale=out_range=pc");
    else {
      const matrix = args.picture.colorMatrix === "rgb" ? "gbr" : args.picture.colorMatrix;
      const range = args.picture.colorRange === "full" ? "pc" : "tv";
      filters.push(`scale=in_color_matrix=${matrix}:in_range=${range}:out_range=pc`);
    }
    filters.push("format=rgba");
    if (args.picture?.alphaMode === "opaque") filters.push("lutrgb=a=255");
  }
  argv.push("-vf", filters.join(","), "-fps_mode", "passthrough");
  argv.push("-frames:v", String(count));
  argv.push("-pix_fmt", output === "rgba8" ? "rgba" : "yuv420p10le", "-f", "rawvideo", "pipe:1");
  return argv;
}

type DecodeWindowArgs = {
  readonly executable: string;
  readonly path: string;
  readonly outputDir: string;
  readonly outputPrefix: string;
  readonly window: Omit<SourceFrameWindow, "source">;
  readonly metadata: SourceVideoMetadata;
  readonly picture?: PictureInterpretation;
  readonly timeoutMs: number;
  readonly maxProcessOutputBytes: number;
  readonly signal?: AbortSignal;
};

async function* decodeSourceFrameFiles(args: DecodeWindowArgs,
  output: "rgba8" | "i420p10"): AsyncGenerator<DecodedSourceFrame> {
  args.signal?.throwIfAborted();
  const count = args.window.endFrameExclusive - args.window.startFrame;
  assert(Number.isSafeInteger(count) && count > 0, "Source decode window is empty");
  await mkdir(args.outputDir, { recursive: true });
  const argv = sourceFrameDecodeArguments(args, output);

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
  const rawFrameBytes = args.metadata.width * args.metadata.height * (output === "rgba8" ? 4 : 3);
  assert(Number.isSafeInteger(rawFrameBytes), "HTML renderer decoded source frame size exceeds safe arithmetic");
  const parser = new FixedFrameParser(rawFrameBytes);
  let produced = 0;
  let completed = false;
  try {
    for await (const chunk of child.stdout!) {
      for (const bytes of parser.push(chunk)) {
        assert(produced < count, "FFmpeg source decoder emitted too many frames");
        const frame = args.window.startFrame + produced++;
        const path = join(args.outputDir, `${args.outputPrefix}-${frame}.${output === "rgba8" ? "rgba" : "i420p10"}`);
        await writeFile(path, bytes);
        yield { frame, path, bytes: bytes.byteLength };
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

export function decodeSourceFrameWindow(args: DecodeWindowArgs): AsyncGenerator<DecodedSourceFrame> {
  return decodeSourceFrameFiles(args, "rgba8");
}

/** Exact 10-bit planar source samples for the Electron HDR Program path. */
export function decodeHdr10SourceFrameWindow(args: DecodeWindowArgs): AsyncGenerator<DecodedSourceFrame> {
  return decodeSourceFrameFiles(args, "i420p10");
}
