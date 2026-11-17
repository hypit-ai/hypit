import {
  mediaPictureExtent, verifyMediaInterpretation, type MediaStoryboardAtlas, type MediaViewRequest, type ResolvedMedia,
} from "@hypit/media";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalZero,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { runBoundedMediaProcess } from "./process.js";
import { pcmSampleIndex } from "./pcm-clock.js";
import { resolveLocalMediaToolchain, type LocalMediaToolchainOptions } from "./toolchain.js";
import { indexLocalVideoFrames, localVideoFrameOrdinal } from "./video-frames.js";
import { peakWaveformFilter } from "./waveform.js";

export type LocalMediaViewResult = {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "audio/wav";
  readonly atlas?: MediaStoryboardAtlas;
};

function boundedInteger(value: number, minimum: number, maximum: number, subject: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${subject} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function mediaRange(media: ResolvedMedia, range: TemporalRange, maxSeconds: number): ExactTemporalValue {
  const duration = media.interpretation.domain?.duration;
  const length = subtractExactTemporalValues(range.end, range.start);
  const zero = exactTemporalZero();
  if (duration === undefined || compareExactTemporalValues(range.start, zero) < 0
    || compareExactTemporalValues(range.end, duration) > 0 || compareExactTemporalValues(length, zero) <= 0) {
    throw new Error("Media view range must lie inside the accepted Media clock.");
  }
  if (compareExactTemporalValues(length, { ticks: String(maxSeconds), timeBase: { numerator: 1, denominator: 1 } }) > 0) {
    throw new Error(`Media view range exceeds ${maxSeconds} seconds.`);
  }
  return length;
}

function wav(pcm: Uint8Array): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.byteLength + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48_000, 24);
  header.writeUInt32LE(192_000, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, pcm]);
}

export async function renderLocalMediaView(input: {
  readonly media: ResolvedMedia;
  readonly request: MediaViewRequest;
  readonly tools?: LocalMediaToolchainOptions;
  readonly signal?: AbortSignal;
}): Promise<LocalMediaViewResult> {
  const { media, request, signal } = input;
  verifyMediaInterpretation(media.interpretation);
  const tools = resolveLocalMediaToolchain(input.tools);
  const source = media.resource.address;
  const ffmpeg = (argv: readonly string[], maxStdoutBytes: number) => runBoundedMediaProcess({
    executable: tools.ffmpegPath,
    argv: ["-hide_banner", "-loglevel", "error", "-nostdin", ...argv],
    timeoutMs: 90_000, maxStdoutBytes,
    ...(signal === undefined ? {} : { signal }),
  });
  if (request.kind === "media.thumbnail" || request.kind === "media.storyboard") {
    const picture = media.interpretation.picture;
    if (picture === undefined) throw new Error("Media picture view requires an accepted Picture stream.");
    if (request.kind === "media.thumbnail" && request.at !== undefined
      && compareExactTemporalValues(request.at, exactTemporalZero()) < 0) {
      throw new Error("Media thumbnail time must be non-negative.");
    }
    const height = boundedInteger(request.height ?? (request.kind === "media.thumbnail" ? 240 : 96), 16, 480, "Media view height");
    const extent = mediaPictureExtent(picture);
    const maximumWidth = request.kind === "media.thumbnail" ? 1280 : 320;
    const width = Math.max(1, Math.min(maximumWidth, Math.round(height * extent.widthPx / extent.heightPx)));
    const fittedHeight = Math.max(1, Math.min(height, Math.round(width * extent.heightPx / extent.widthPx)));
    const rotation = picture.interpretation.rotationDegrees;
    const filters = rotation === 90 ? ["transpose=clock"] : rotation === 180 ? ["hflip", "vflip"]
      : rotation === 270 ? ["transpose=cclock"] : [];
    filters.push(`scale=${width}:${fittedHeight}`, "setsar=1");
    let ordinals = [0];
    let samples: MediaStoryboardAtlas["samples"] = [];
    if (picture.kind === "signal") {
      const first = picture.map.stages[0]?.pieces[0]?.target.start ?? exactTemporalZero();
      const positions = request.kind === "media.thumbnail"
        ? [{ at: request.at ?? first }]
        : (() => {
            const length = mediaRange(media, request.range, 7200);
            const count = boundedInteger(request.frames, 1, 30, "Storyboard frames");
            return Array.from({ length: count }, (_, i) => ({
              at: addExactTemporalValues(request.range.start, scaleExactTemporalValue(length, { numerator: i, denominator: count })),
            }));
          })();
      const resolved = positions.flatMap(({ at }) => {
        const sample = evaluateTemporalMap(picture.map, at, "after");
        return sample === undefined ? [] : [{ at, sample }];
      });
      if (resolved.length === 0) throw new Error("The selected Media range has no Picture samples.");
      const index = await indexLocalVideoFrames({
        address: source, stream: picture.streamIndex, ffprobePath: tools.ffprobePath,
        ...(signal === undefined ? {} : { signal }),
      });
      const indexed = resolved.map(({ at, sample }) => ({
        at, ordinal: localVideoFrameOrdinal(index, sample.position, sample.sourceSide, "sided", picture.presentationStart),
      }));
      ordinals = [...new Set(indexed.map(value => value.ordinal))].sort((left, right) => left - right);
      samples = indexed.map(({ at, ordinal }) => ({ at, tile: ordinals.indexOf(ordinal) }));
      filters.unshift(`select=${ordinals.map(value => `eq(n\\,${value})`).join("+")}`);
    } else if (request.kind === "media.storyboard") {
      throw new Error("A storyboard requires a timed Picture stream.");
    }
    const columns = Math.min(6, ordinals.length);
    const rows = Math.ceil(ordinals.length / columns);
    if (request.kind === "media.storyboard") filters.push(`tile=${columns}x${rows}:nb_frames=${ordinals.length}`);
    const bytes = await ffmpeg([
      "-noautorotate", "-i", source, "-map", `0:${picture.streamIndex}`, "-vf", filters.join(","),
      "-fps_mode", "passthrough", "-frames:v", "1", "-an", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ], 24 * 1024 * 1024);
    if (bytes.byteLength === 0) throw new Error("Media picture view produced no image.");
    return { bytes, mediaType: "image/png", ...(request.kind === "media.storyboard" ? { atlas: {
      count: ordinals.length, columns, rows, tileWidth: width, tileHeight: fittedHeight, samples,
    } } : {}) };
  }

  const audio = media.interpretation.audio;
  if (audio === undefined) throw new Error("Media audio view requires an accepted Audio stream.");
  mediaRange(media, request.range, request.kind === "media.audio-preview" ? 30 : 600);
  const [stage] = audio.map.stages;
  const [piece] = stage?.pieces ?? [];
  if (audio.map.stages.length !== 1 || stage?.pieces.length !== 1 || piece === undefined || !("rate" in piece)
    || piece.rate.numerator !== piece.rate.denominator || piece.wrap !== undefined) {
    throw new Error("Media audio view requires one unwrapped unit-rate stream mapping.");
  }
  const first = pcmSampleIndex(request.range.start, 48_000);
  const last = pcmSampleIndex(request.range.end, 48_000);
  const targetStart = pcmSampleIndex(piece.target.start, 48_000);
  const targetEnd = pcmSampleIndex(piece.target.end, 48_000);
  const sourceStart = pcmSampleIndex(piece.sourceAtStart, 48_000);
  if (last <= first || targetEnd <= targetStart) throw new Error("Media audio view range has no PCM samples.");
  const filter = [
    "asetpts=PTS-STARTPTS", "aresample=48000:first_pts=0",
    `atrim=start_sample=${sourceStart}:end_sample=${sourceStart + targetEnd - targetStart}`, "asetpts=PTS-STARTPTS",
    `adelay=${targetStart}S:all=1`, "apad", `atrim=start_sample=${first}:end_sample=${last}`, "asetpts=PTS-STARTPTS",
  ].join(",");
  if (request.kind === "media.audio-preview") {
    const pcm = await ffmpeg(["-i", source, "-map", `0:${audio.streamIndex}`, "-af", filter,
      "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", "-f", "s16le", "pipe:1"], 6 * 1024 * 1024);
    if (pcm.byteLength !== (last - first) * 4) throw new Error("Media audio preview did not produce the selected sample count.");
    return { bytes: wav(pcm), mediaType: "audio/wav" };
  }
  const waveform = peakWaveformFilter(request.width ?? 1024, request.height ?? 96);
  const bytes = await ffmpeg(["-i", source, "-filter_complex", `[0:${audio.streamIndex}]${filter},${waveform}[out]`,
    "-map", "[out]", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], 8 * 1024 * 1024);
  if (bytes.byteLength === 0) throw new Error("Media waveform produced no image.");
  return { bytes, mediaType: "image/png" };
}
