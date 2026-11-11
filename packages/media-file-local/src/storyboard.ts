import { runBoundedMediaProcess } from "@hypit/media-local/process";

import { probeMedia } from "./files.js";

export type StoryboardOptions = {
  readonly start?: number;
  readonly end?: number;
  readonly tileHeight?: number;
  readonly maximumFrames?: number;
};

export type StoryboardAtlas = {
  readonly bytes: Buffer;
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly sampleFps: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Build a compact filmstrip atlas for one exact source interval.
 *
 * The atlas retains each tile's aspect ratio. Timeline clients decide how many fixed-aspect slots
 * fit in the current Item width and select atlas frames by Item-local progress; zoom never stretches
 * the atlas itself.
 */
export async function renderStoryboardAtlas(
  path: string,
  options: StoryboardOptions = {},
): Promise<StoryboardAtlas> {
  const media = await probeMedia(path);
  assert(media.hasVideo, `${path}: a storyboard requires a video stream`);
  const start = options.start ?? 0;
  const end = options.end ?? media.duration;
  assert(Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start
    && end <= media.duration + 0.001, `storyboard range must satisfy 0 <= start < end <= ${media.duration} s`);
  const duration = end - start;
  const tileHeight = options.tileHeight ?? 80;
  const maximumFrames = options.maximumFrames ?? 360;
  assert(Number.isSafeInteger(tileHeight) && tileHeight > 0, "storyboard tile height must be a positive integer");
  assert(Number.isSafeInteger(maximumFrames) && maximumFrames > 0,
    "storyboard maximum frame count must be a positive integer");
  const tileWidth = Math.max(1, Math.round(tileHeight * media.width / media.height));
  const sourceFps = media.frameRate > 0 ? media.frameRate : 1;
  const sampleFps = Math.min(sourceFps, maximumFrames / duration);
  const count = Math.max(1, Math.floor(duration * sampleFps));
  const columns = Math.min(32, count);
  const rows = Math.ceil(count / columns);
  const filter = [
    `fps=${sampleFps.toFixed(6)}`,
    `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
    `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2:black`,
    `tile=layout=${columns}x${rows}:nb_frames=${count}:padding=0:margin=0`,
  ].join(",");
  const bytes = await runBoundedMediaProcess({
    executable: "ffmpeg",
    argv: [
      "-hide_banner", "-loglevel", "error",
      ...(start > 0 ? ["-ss", String(start)] : []),
      "-i", path,
      "-t", String(duration),
      "-vf", filter,
      "-frames:v", "1",
      "-an", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ],
    timeoutMs: 300_000,
    maxStdoutBytes: 64 * 1024 * 1024,
  });
  return {
    bytes: Buffer.from(bytes),
    count,
    columns,
    rows,
    tileWidth,
    tileHeight,
    sampleFps,
  };
}
