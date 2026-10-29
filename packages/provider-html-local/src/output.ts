import type { HtmlProgram } from "@hypit/html-program";
import type { VisualDeliverySpec } from "@hypit/media";
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
  readonly pix_fmt?: unknown;
  readonly color_range?: unknown;
  readonly color_space?: unknown;
  readonly color_transfer?: unknown;
  readonly color_primaries?: unknown;
};

type ProbeSideData = Record<string, unknown> & { readonly side_data_type?: unknown };

function parseFraction(value: unknown, subject: string): number {
  assert(typeof value === "string" && /^\d+\/\d+$/u.test(value), `${subject} is not a rational`);
  const [numerator, denominator] = value.split("/");
  assert(numerator !== undefined && denominator !== undefined && Number(denominator) > 0, `${subject} is invalid`);
  return Number(numerator) / Number(denominator);
}

async function verifyHdrStaticMetadata(args: {
  readonly path: string;
  readonly delivery: VisualDeliverySpec;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const expected = args.delivery.hdrStaticMetadata;
  if (expected === undefined) return;
  const probe = await runProcess({
    executable: args.ffprobePath,
    argv: ["-v", "error", "-show_frames", "-read_intervals", "0%+#1", "-of", "json", args.path],
    timeoutMs: args.timeoutMs,
    maxOutputBytes: args.maxOutputBytes,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
  const parsed = JSON.parse(Buffer.from(probe.stdout).toString("utf8")) as { readonly frames?: unknown };
  assert(Array.isArray(parsed.frames) && parsed.frames.length === 1,
    "Rendered HDR visual has no first frame metadata");
  const sideData = (parsed.frames[0] as { readonly side_data_list?: unknown }).side_data_list;
  assert(Array.isArray(sideData), "Rendered HDR visual has no static metadata");
  const mastering = sideData.find(item => (item as ProbeSideData).side_data_type === "Mastering display metadata") as ProbeSideData | undefined;
  const light = sideData.find(item => (item as ProbeSideData).side_data_type === "Content light level metadata") as ProbeSideData | undefined;
  assert(mastering !== undefined, "Rendered HDR visual has no mastering-display metadata");
  assert(light !== undefined, "Rendered HDR visual has no content-light metadata");
  const display = expected.masteringDisplay;
  const close = (actual: unknown, wanted: number, subject: string, scale: number) =>
    assert(Math.abs(parseFraction(actual, subject) - wanted) <= 0.5 / scale,
      `${subject} differs from its delivery requirement`);
  close(mastering.red_x, display.red.x, "Rendered HDR red x", 50_000);
  close(mastering.red_y, display.red.y, "Rendered HDR red y", 50_000);
  close(mastering.green_x, display.green.x, "Rendered HDR green x", 50_000);
  close(mastering.green_y, display.green.y, "Rendered HDR green y", 50_000);
  close(mastering.blue_x, display.blue.x, "Rendered HDR blue x", 50_000);
  close(mastering.blue_y, display.blue.y, "Rendered HDR blue y", 50_000);
  close(mastering.white_point_x, display.whitePoint.x, "Rendered HDR white-point x", 50_000);
  close(mastering.white_point_y, display.whitePoint.y, "Rendered HDR white-point y", 50_000);
  close(mastering.min_luminance, display.minLuminanceNits, "Rendered HDR minimum luminance", 10_000);
  close(mastering.max_luminance, display.maxLuminanceNits, "Rendered HDR maximum luminance", 10_000);
  assert(light.max_content === expected.contentLight.maxContentLightLevelNits,
    "Rendered HDR MaxCLL differs from its delivery requirement");
  assert(light.max_average === expected.contentLight.maxFrameAverageLightLevelNits,
    "Rendered HDR MaxFALL differs from its delivery requirement");
}

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
  readonly document: Pick<HtmlProgram, "frameRate" | "frameCount" | "canvas">;
  readonly delivery: VisualDeliverySpec;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const probe = await runProcess({
    executable: args.ffprobePath,
    // The renderer has already counted accepted frames and the MP4 muxer records
    // that exact sample count. Read container metadata here; decoding the entire
    // freshly encoded stream a second time adds no new boundary fact.
    argv: ["-v", "error", "-print_format", "json", "-show_streams", args.path],
    timeoutMs: args.timeoutMs,
    maxOutputBytes: args.maxOutputBytes,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(probe.stdout).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON for the HTML renderer output");
  }
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "ffprobe returned an invalid HTML renderer inspection");
  const streams = (value as { readonly streams?: unknown }).streams;
  assert(Array.isArray(streams) && streams.length === 1, "Rendered visual must contain exactly one stream");
  const stream = streams[0] as ProbeStream;
  assert(stream.codec_type === "video" && stream.codec_name === args.delivery.encoding.codec,
    "Rendered visual codec differs from its delivery requirement");
  assert(stream.pix_fmt === args.delivery.encoding.pixelFormat,
    "Rendered visual pixel format differs from its delivery requirement");
  assert(stream.color_range === "tv" && args.delivery.picture.colorRange === "limited",
    "Rendered visual color range differs from its delivery requirement");
  const ffprobeMatrix = args.delivery.picture.colorMatrix === "bt2020-ncl"
    ? "bt2020nc"
    : args.delivery.picture.colorMatrix;
  assert(stream.color_space === ffprobeMatrix,
    "Rendered visual color matrix differs from its delivery requirement");
  const ffprobeTransfer = args.delivery.picture.colorTransfer === "pq" ? "smpte2084"
    : args.delivery.picture.colorTransfer === "hlg" ? "arib-std-b67"
      : args.delivery.picture.colorTransfer;
  assert(stream.color_transfer === ffprobeTransfer,
    `Rendered visual color transfer ${String(stream.color_transfer)} differs from ${ffprobeTransfer}`);
  assert(stream.color_primaries === args.delivery.picture.colorPrimaries,
    "Rendered visual color primaries differ from its delivery requirement");
  assert(stream.width === args.document.canvas.width && stream.height === args.document.canvas.height,
    "Rendered visual canvas differs from its document");
  const rate = parseRational(stream.avg_frame_rate ?? stream.r_frame_rate, "Rendered visual frame rate");
  assert(equalsRational(rate, args.document.frameRate), "Rendered visual frame rate differs from its document");
  assert(outputFrameCount(stream) === args.document.frameCount,
    "Rendered visual frame count differs from its document");
  await verifyHdrStaticMetadata(args);
}
