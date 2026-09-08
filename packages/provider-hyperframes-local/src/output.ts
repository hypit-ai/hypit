import type { HyperframesDocument } from "@hypit/hyperframes";
import { assert, runProcess } from "./process.js";

type ProbeStream = {
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly avg_frame_rate?: unknown;
  readonly r_frame_rate?: unknown;
  readonly nb_read_frames?: unknown;
  readonly nb_frames?: unknown;
};

function parseRational(value: unknown, subject: string): { readonly numerator: bigint; readonly denominator: bigint } {
  assert(typeof value === "string" && /^\d+\/\d+$/u.test(value), `${subject} is not a rational`);
  const [numerator, denominator] = value.split("/");
  assert(numerator !== undefined && denominator !== undefined && BigInt(denominator) > 0n,
    `${subject} is invalid`);
  return { numerator: BigInt(numerator), denominator: BigInt(denominator) };
}

function equalsRational(
  actual: { readonly numerator: bigint; readonly denominator: bigint },
  expected: { readonly numerator: number; readonly denominator: number },
): boolean {
  return actual.numerator * BigInt(expected.denominator)
    === BigInt(expected.numerator) * actual.denominator;
}

function outputFrameCount(stream: ProbeStream): number {
  const value = stream.nb_read_frames ?? stream.nb_frames;
  assert(typeof value === "string" && /^\d+$/u.test(value), "Rendered visual has no decoded frame count");
  const count = Number(value);
  assert(Number.isSafeInteger(count), "Rendered visual frame count exceeds safe arithmetic");
  return count;
}

export async function verifyOutput(args: {
  readonly path: string;
  readonly document: HyperframesDocument;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const probe = await runProcess({
    executable: args.ffprobePath,
    argv: ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", args.path],
    timeoutMs: args.timeoutMs,
    maxOutputBytes: args.maxOutputBytes,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(probe.stdout).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON for the HyperFrames output");
  }
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "ffprobe returned an invalid HyperFrames inspection");
  const streams = (value as { readonly streams?: unknown }).streams;
  assert(Array.isArray(streams) && streams.length === 1, "Rendered visual must contain exactly one stream");
  const stream = streams[0] as ProbeStream;
  assert(stream.codec_type === "video" && stream.codec_name === "h264",
    "Rendered visual must contain one H.264 video stream and no audio");
  assert(stream.width === args.document.canvas.width && stream.height === args.document.canvas.height,
    "Rendered visual canvas differs from its document");
  const rate = parseRational(stream.avg_frame_rate ?? stream.r_frame_rate, "Rendered visual frame rate");
  assert(equalsRational(rate, args.document.frameRate), "Rendered visual frame rate differs from its document");
  assert(outputFrameCount(stream) === args.document.frameCount,
    "Rendered visual frame count differs from its document");
}
