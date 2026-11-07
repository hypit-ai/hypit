import { verifyPictureInterpretation } from "@hypit/media";
import type { PictureInterpretation } from "@hypit/media";
import { runProcess } from "./process.js";

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
  readonly components?: readonly { readonly bit_depth?: unknown }[];
};

type PixelFormatProperties = {
  readonly alpha: boolean;
  readonly componentDepths: readonly number[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
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

function rotation(stream: ProbeStream): number {
  const side = stream.side_data_list?.map(object).find((item) => item?.side_data_type === "Display Matrix");
  const value = side?.rotation ?? stream.tags?.rotate ?? 0;
  const parsed = typeof value === "number" ? value : Number(value);
  assert(Number.isFinite(parsed), "Picture Artifact rotation metadata is invalid");
  return ((parsed % 360) + 360) % 360;
}

function assertExactPicture(
  stream: ProbeStream,
  format: PixelFormatProperties,
  picture: PictureInterpretation,
  subject: string,
): void {
  const imageLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full";
  const videoLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "bt709"
    && picture.colorMatrix === "bt709" && picture.colorRange === "limited";
  assert(picture.bitDepth === 8 && (imageLike || videoLike),
    `${subject} is outside the local renderer's exact SDR picture support`);
  const expected = [
    ["color_primaries", new Set(["bt709"])],
    ["color_transfer", imageLike ? new Set(["iec61966-2-1"]) : new Set(["bt709"])],
    ["color_space", imageLike ? new Set(["gbr", "rgb"]) : new Set(["bt709"])],
    ["color_range", imageLike ? new Set(["pc", "jpeg"]) : new Set(["tv", "mpeg"])],
  ] as const;
  for (const [name, values] of expected) {
    const value = stream[name];
    // A declaration supplies the source interpretation. Embedded tags are only
    // contradictions to reject; their absence is not a second proof obligation.
    assert(value === undefined || (typeof value === "string" && values.has(value as never)),
      `${subject} ${name} ${String(value)} contradicts its declared picture interpretation`);
  }
  assert(format.componentDepths.length > 0
    && format.componentDepths.every(depth => depth === picture.bitDepth),
  `${subject} pixel depth differs from its declared picture interpretation`);
  const alphaTag = stream.tags?.alpha_mode;
  const taggedAlpha = alphaTag === "1" || alphaTag === "2"
    || alphaTag === "straight" || alphaTag === "premultiplied";
  const hasAlpha = format.alpha || taggedAlpha;
  if (picture.alphaMode === "straight") {
    // A carrier without an alpha component is the ordinary all-opaque subset
    // of straight alpha. When alpha bytes do exist, their encoding must not
    // contradict the declaration.
    if (hasAlpha) {
      assert(alphaTag !== "1" && alphaTag !== "premultiplied",
        `${subject} declares straight alpha but its bytes declare premultiplied alpha`);
      assert(alphaTag === "2" || alphaTag === "straight" || stream.codec_name === "png" || stream.codec_name === "webp",
        `${subject} straight-alpha semantics are not supported by its encoding`);
    }
  } else assert(!hasAlpha, `${subject} declares opaque pixels but its encoded format carries alpha`);
}

const pixelFormats = new Map<string, Map<string, PixelFormatProperties>>();

async function pixelFormatAlpha(
  ffprobePath: string,
  timeoutMs: number,
  maxOutputBytes: number,
  signal: AbortSignal,
): Promise<Map<string, PixelFormatProperties>> {
  signal.throwIfAborted();
  const cached = pixelFormats.get(ffprobePath);
  if (cached !== undefined) return cached;
  const root = json((await runProcess({ executable: ffprobePath,
    argv: ["-v", "error", "-print_format", "json", "-show_pixel_formats"],
    timeoutMs, maxOutputBytes, signal,
  })).stdout, "ffprobe pixel-format query");
  assert(Array.isArray(root.pixel_formats), "ffprobe returned no pixel-format table");
  const result = new Map<string, PixelFormatProperties>();
  for (const raw of root.pixel_formats) {
    const format = object(raw) as PixelFormat | undefined;
    const depths = format?.components?.map(component => Number(component.bit_depth));
    if (typeof format?.name === "string" && depths !== undefined
      && depths.length > 0 && depths.every(depth => Number.isSafeInteger(depth) && depth > 0)) {
      result.set(format.name, { alpha: format.flags?.alpha === 1, componentDepths: depths });
    }
  }
  // Cache completed facts only; cancelling one caller cannot cancel another's probe.
  pixelFormats.set(ffprobePath, result);
  return result;
}

/**
 * A browser-decoded still uses its author-resolved sRGB interpretation. Missing
 * tags do not invalidate that declaration; contradictory embedded tags still do.
 * The carrier must contain one unrotated still frame with the declared depth and alpha.
 */
export async function verifyPictureArtifactFile(options: {
  readonly picture: PictureInterpretation;
  readonly path: string;
  readonly ffprobePath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  verifyPictureInterpretation(options.picture, "HTML picture Artifact interpretation");
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const ffprobePath = options.ffprobePath ?? "ffprobe";
  const timeoutMs = options.processTimeoutMs ?? 120_000;
  const maxOutputBytes = options.maxProbeOutputBytes ?? 8 * 1024 * 1024;
  const [probe, formats] = await Promise.all([
    runProcess({ executable: ffprobePath,
      argv: ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", options.path],
      timeoutMs, maxOutputBytes, signal,
    }).then(result => result.stdout),
    pixelFormatAlpha(ffprobePath, timeoutMs, maxOutputBytes, signal),
  ]);
  const root = json(probe, "ffprobe picture Artifact query");
  assert(Array.isArray(root.streams) && root.streams.length === 1,
    "Picture Artifact must contain exactly one visual stream and no auxiliary streams");
  const stream = root.streams[0] as ProbeStream;
  assert(stream.codec_type === "video", "Picture Artifact stream is not visual");
  assert(stream.disposition?.attached_pic !== 1, "Picture Artifact cannot be an attached-picture stream");
  assert(rotation(stream) === 0, "Picture Artifact must not depend on display rotation metadata");
  assert(stream.sample_aspect_ratio === undefined || stream.sample_aspect_ratio === "1:1",
    "Picture Artifact must use square pixels");
  assert(stream.field_order === undefined || stream.field_order === "progressive" || stream.field_order === "unknown",
    "Picture Artifact must be progressive");
  assert(typeof stream.pix_fmt === "string" && stream.pix_fmt.length > 0,
    "Picture Artifact pixel format is absent");
  const format = formats.get(stream.pix_fmt);
  assert(format !== undefined, `Picture Artifact pixel format ${stream.pix_fmt} is unknown to ffprobe`);
  assertExactPicture(stream, format, options.picture, "Picture Artifact");
  assert(positiveInteger(stream.nb_read_frames ?? stream.nb_frames, "Picture Artifact frame count") === 1,
    "Picture Artifact must decode to exactly one frame");
}
