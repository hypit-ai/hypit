import type { MediaInspection } from "@hypit/media";
import { runBoundedMediaProcess, runMediaProcessLines } from "./process.js";
import { createMediaInspectionCollector, parseMediaContainerIndex } from "./probe.js";

type InspectionOptions = {
  readonly ffprobePath?: string;
  readonly timeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
  readonly signal?: AbortSignal;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

async function jsonProbe(
  executable: string,
  argv: readonly string[],
  options: Required<Pick<InspectionOptions, "timeoutMs" | "maxProbeOutputBytes">> & Pick<InspectionOptions, "signal">,
): Promise<Record<string, unknown>> {
  const bytes = await runBoundedMediaProcess({
    executable,
    argv,
    timeoutMs: options.timeoutMs,
    maxStdoutBytes: options.maxProbeOutputBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  try {
    return object(JSON.parse(Buffer.from(bytes).toString("utf8")), "ffprobe response");
  } catch (error) {
    throw new Error("ffprobe returned invalid JSON.", { cause: error });
  }
}

const pixelFormatsByExecutable = new Map<string, Promise<readonly unknown[]>>();

async function pixelFormats(
  executable: string,
  options: Required<Pick<InspectionOptions, "timeoutMs" | "maxProbeOutputBytes">> & Pick<InspectionOptions, "signal">,
): Promise<readonly unknown[]> {
  let pending = pixelFormatsByExecutable.get(executable);
  if (pending === undefined) {
    pending = jsonProbe(executable, [
      "-v", "error", "-f", "lavfi", "-i", "color=s=1x1:d=0.001",
      "-print_format", "json", "-show_pixel_formats", "-show_entries",
      "pixel_format=name:pixel_format_flags=alpha:component=bit_depth",
    ], options).then((value) => Array.isArray(value.pixel_formats) ? value.pixel_formats : []);
    pixelFormatsByExecutable.set(executable, pending);
    void pending.catch(() => pixelFormatsByExecutable.delete(executable));
  }
  return await pending;
}

function resolvedOptions(options: InspectionOptions) {
  return {
    executable: options.ffprobePath ?? "ffprobe",
    timeoutMs: options.timeoutMs ?? 300_000,
    maxProbeOutputBytes: options.maxProbeOutputBytes ?? 16 * 1024 * 1024,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}

export async function inspectMediaFileFromContainerIndex(
  path: string,
  options: InspectionOptions & { readonly constantPicture?: boolean } = {},
): Promise<MediaInspection> {
  const selected = resolvedOptions(options);
  const [metadata, formats] = await Promise.all([
    jsonProbe(selected.executable, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], selected),
    pixelFormats(selected.executable, selected),
  ]);
  return parseMediaContainerIndex({ ...metadata, pixel_formats: formats }, {
    ...(options.constantPicture === undefined ? {} : { constantPicture: options.constantPicture }),
  });
}

export async function inspectMediaFileByDecodedUnits(
  path: string,
  options: InspectionOptions = {},
): Promise<MediaInspection> {
  const selected = resolvedOptions(options);
  const [metadata, formats] = await Promise.all([
    jsonProbe(selected.executable, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], selected),
    pixelFormats(selected.executable, selected),
  ]);
  const collector = createMediaInspectionCollector({ ...metadata, pixel_formats: formats }, {
    timingSource: "decoded-frames",
  });
  await runMediaProcessLines({
    executable: selected.executable,
    argv: [
      "-v", "error", "-show_frames",
      "-show_entries", "frame=media_type,stream_index,pts,best_effort_timestamp,duration,pkt_duration,nb_samples",
      "-of", "compact=p=0:nk=0", path,
    ],
    timeoutMs: selected.timeoutMs,
    maxLineBytes: selected.maxProbeOutputBytes,
    onLine(line) {
      if (line.length === 0) return;
      const frame: Record<string, string> = {};
      for (const field of line.split("|")) {
        const separator = field.indexOf("=");
        if (separator > 0) frame[field.slice(0, separator)] = field.slice(separator + 1);
      }
      collector.observe(frame);
    },
    ...(selected.signal === undefined ? {} : { signal: selected.signal }),
  });
  return collector.finish();
}

/** Inspect the primary signal and establish its timing for project adoption. */
export async function inspectMediaFileForAdoption(
  path: string, mediaType: string, options: InspectionOptions = {},
): Promise<MediaInspection> {
  const constantPicture = mediaType.startsWith("image/");
  const inspection = await inspectMediaFileFromContainerIndex(path, { ...options, constantPicture });
  const primary = mediaType.startsWith("audio/") ? "audio" : "picture";
  if (constantPicture || inspection.streams.some(stream =>
    stream.kind === primary && !stream.disposition.attachedPicture && stream.startPts !== undefined && stream.endPts !== undefined)) {
    return inspection;
  }
  return await inspectMediaFileByDecodedUnits(path, options);
}
