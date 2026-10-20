type JsonObject = Record<string, unknown>;

export type FfprobeDisplayStream = {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly tags?: { readonly rotate?: unknown };
  readonly side_data_list?: readonly unknown[];
};

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Interpret ffprobe display rotation once for all media-local byte tools. */
export function ffprobeDisplayRotation(
  stream: FfprobeDisplayStream,
  label = "video stream",
): 0 | 90 | 180 | 270 {
  const sideData = stream.side_data_list?.map(object)
    .find((item) => item?.side_data_type === "Display Matrix");
  const raw = numeric(sideData?.rotation) ?? numeric(stream.tags?.rotate) ?? 0;
  const normalized = ((raw % 360) + 360) % 360;
  for (const quarter of [0, 90, 180, 270] as const) {
    if (Math.abs(normalized - quarter) < 1e-6) return quarter;
  }
  throw new Error(`${label} uses unsupported non-quarter display rotation ${raw}`);
}

/** Dimensions of the frames FFmpeg emits after its ordinary autorotation. */
export function ffprobeDisplayExtent(
  stream: FfprobeDisplayStream,
  label = "video stream",
): { readonly width: number; readonly height: number } {
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error(`${label} dimensions are invalid`);
  }
  const rotation = ffprobeDisplayRotation(stream, label);
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}
