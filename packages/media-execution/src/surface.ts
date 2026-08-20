import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertCompositableSurfaceRef } from "@hypit/media";
import type { CompositableSurfaceRef } from "@hypit/media";

type JsonObject = Record<string, unknown>;

type ProbeStream = {
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly pix_fmt?: unknown;
  readonly sample_aspect_ratio?: unknown;
  readonly avg_frame_rate?: unknown;
  readonly r_frame_rate?: unknown;
  readonly nb_read_frames?: unknown;
  readonly nb_frames?: unknown;
  readonly color_range?: unknown;
  readonly color_space?: unknown;
  readonly color_transfer?: unknown;
  readonly color_primaries?: unknown;
  readonly field_order?: unknown;
  readonly disposition?: { readonly attached_pic?: unknown };
  readonly tags?: { readonly rotate?: unknown; readonly alpha_mode?: unknown };
  readonly side_data_list?: readonly unknown[];
};

type PixelFormat = {
  readonly name?: unknown;
  readonly flags?: { readonly alpha?: unknown };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

async function runProcess(args: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const child = spawn(args.executable, [...args.argv], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
    });
    const stdout: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve(Buffer.concat(stdout));
      else reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${args.executable} timed out`));
    }, args.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > args.maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${args.executable} output exceeded the configured limit`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
      if (bytes > args.maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${args.executable} output exceeded the configured limit`));
      }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${args.executable} exited ${String(code)}: ${stderr}`));
    });
  });
}

function json(bytes: Uint8Array, subject: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${subject} returned invalid JSON`);
  }
  const result = object(value);
  assert(result !== undefined, `${subject} returned an invalid object`);
  return result;
}

function positiveInteger(value: unknown, subject: string): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  assert(Number.isSafeInteger(parsed) && parsed > 0, `${subject} is not a positive integer`);
  return parsed;
}

function rational(value: unknown, subject: string): { readonly numerator: number; readonly denominator: number } {
  assert(typeof value === "string" && /^\d+\/\d+$/u.test(value), `${subject} is not a rational`);
  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);
  assert(Number.isSafeInteger(numerator) && numerator > 0
    && Number.isSafeInteger(denominator) && denominator > 0, `${subject} is invalid`);
  return { numerator, denominator };
}

function sameRational(
  left: { readonly numerator: number; readonly denominator: number },
  right: { readonly numerator: number; readonly denominator: number },
): boolean {
  return BigInt(left.numerator) * BigInt(right.denominator)
    === BigInt(right.numerator) * BigInt(left.denominator);
}

function rotation(stream: ProbeStream): number {
  const side = stream.side_data_list?.map(object).find((item) => item?.side_data_type === "Display Matrix");
  const value = side?.rotation ?? stream.tags?.rotate ?? 0;
  const parsed = typeof value === "number" ? value : Number(value);
  assert(Number.isFinite(parsed), "Surface rotation metadata is invalid");
  return ((parsed % 360) + 360) % 360;
}

function assertSrgb(stream: ProbeStream): void {
  const allowed = {
    color_space: new Set([undefined, "unknown", "gbr", "rgb", "bt709"]),
    color_transfer: new Set([undefined, "unknown", "iec61966-2-1", "bt709"]),
    color_primaries: new Set([undefined, "unknown", "bt709"]),
    color_range: new Set([undefined, "unknown", "pc", "tv"]),
  } as const;
  for (const [name, values] of Object.entries(allowed)) {
    const value = stream[name as keyof typeof allowed];
    assert(typeof value === "string" || value === undefined, `Surface ${name} metadata is invalid`);
    assert(values.has(value), `Surface ${name} ${String(value)} is not SDR sRGB-compatible`);
  }
}

const pixelFormats = new Map<string, Promise<Map<string, boolean>>>();

async function pixelFormatAlpha(
  ffprobePath: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<Map<string, boolean>> {
  let pending = pixelFormats.get(ffprobePath);
  if (pending === undefined) {
    pending = (async () => {
      const root = json(await runProcess({
        executable: ffprobePath,
        argv: ["-v", "error", "-print_format", "json", "-show_pixel_formats"],
        timeoutMs,
        maxOutputBytes,
      }), "ffprobe pixel-format query");
      assert(Array.isArray(root.pixel_formats), "ffprobe returned no pixel-format table");
      const result = new Map<string, boolean>();
      for (const raw of root.pixel_formats) {
        const format = object(raw) as PixelFormat | undefined;
        if (typeof format?.name === "string") result.set(format.name, format.flags?.alpha === 1);
      }
      return result;
    })();
    pixelFormats.set(ffprobePath, pending);
  }
  return await pending;
}

function suffix(mediaType: string): string {
  if (mediaType === "image/png") return ".png";
  if (mediaType === "image/webp") return ".webp";
  if (mediaType === "video/webm") return ".webm";
  if (mediaType === "video/mp4") return ".mp4";
  throw new Error(`Surface media type ${mediaType} is unsupported`);
}

/**
 * Decode and verify one typed Surface before its bytes enter a renderer.
 *
 * This is an admission gate, not a second media Product. Success returns no
 * side-channel facts; anything a later graph step needs must be an explicit output.
 */
export async function verifyCompositableSurfaceBytes(options: {
  readonly surface: CompositableSurfaceRef;
  readonly bytes: Uint8Array;
  readonly ffprobePath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
}): Promise<void> {
  assertCompositableSurfaceRef(options.surface);
  assert(options.bytes.byteLength === options.surface.artifact.size,
    `Surface ${options.surface.artifact.digest} byte size differs`);
  const ffprobePath = options.ffprobePath ?? "ffprobe";
  const timeoutMs = options.processTimeoutMs ?? 120_000;
  const maxOutputBytes = options.maxProbeOutputBytes ?? 8 * 1024 * 1024;
  const directory = await mkdtemp(join(tmpdir(), "hypit-surface-verify-"));
  try {
    const path = join(directory, `surface${suffix(options.surface.artifact.mediaType)}`);
    await writeFile(path, options.bytes);
    const [probe, formats] = await Promise.all([
      runProcess({
        executable: ffprobePath,
        argv: ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", path],
        timeoutMs,
        maxOutputBytes,
      }),
      pixelFormatAlpha(ffprobePath, timeoutMs, maxOutputBytes),
    ]);
    const root = json(probe, "ffprobe Surface query");
    assert(Array.isArray(root.streams) && root.streams.length === 1,
      "Surface must contain exactly one visual stream and no audio or auxiliary streams");
    const stream = root.streams[0] as ProbeStream;
    assert(stream.codec_type === "video", "Surface stream is not visual");
    assert(stream.disposition?.attached_pic !== 1, "Surface cannot be an attached-picture stream");
    const width = positiveInteger(stream.width, "Surface width");
    const height = positiveInteger(stream.height, "Surface height");
    assert(width === options.surface.width && height === options.surface.height,
      "Surface decoded dimensions differ from its declaration");
    assert(stream.sample_aspect_ratio === undefined || stream.sample_aspect_ratio === "1:1",
      "Surface must use square pixels");
    assert(rotation(stream) === 0, "Surface must not depend on display rotation metadata");
    assert(stream.field_order === undefined || stream.field_order === "progressive" || stream.field_order === "unknown",
      "Surface must be progressive");
    assertSrgb(stream);

    assert(typeof stream.pix_fmt === "string" && stream.pix_fmt.length > 0,
      "Surface pixel format is absent");
    const pixelAlpha = formats.get(stream.pix_fmt);
    assert(pixelAlpha !== undefined, `Surface pixel format ${stream.pix_fmt} is unknown to ffprobe`);
    const taggedAlpha = stream.tags?.alpha_mode === "1" || stream.tags?.alpha_mode === "straight";
    const hasAlpha = pixelAlpha || taggedAlpha;
    if (options.surface.alphaMode === "straight") {
      assert(hasAlpha, "Surface declares straight alpha but its bytes carry no alpha channel");
    } else {
      assert(!hasAlpha, "Surface declares opaque pixels but its encoded format carries alpha");
    }

    const frameCount = positiveInteger(stream.nb_read_frames ?? stream.nb_frames, "Surface frame count");
    if (options.surface.timing.kind === "still") {
      assert(frameCount === 1, "Still Surface must decode to exactly one frame");
    } else {
      assert(frameCount === options.surface.timing.frameCount,
        "Surface decoded frame count differs from its declaration");
      const rate = rational(stream.avg_frame_rate ?? stream.r_frame_rate, "Surface frame rate");
      assert(sameRational(rate, options.surface.timing.frameRate),
        "Surface decoded frame rate differs from its declaration");
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
