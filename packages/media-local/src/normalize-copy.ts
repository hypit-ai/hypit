import type { MediaRational, MediaVideoStream } from "@hypit/media";

type VideoFrame = {
  readonly pts?: number | string;
  readonly duration?: number | string;
  readonly pkt_duration?: number | string;
  readonly width?: number;
  readonly height?: number;
  readonly pix_fmt?: string;
  readonly sample_aspect_ratio?: string;
  readonly interlaced_frame?: number;
  readonly side_data_list?: readonly { readonly rotation?: number }[];
};

function ticks(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);
  return undefined;
}

/** Provider-private proof that the decoded stream already spans the requested frame clock. */
export function normalizedVideoSpan(
  video: MediaVideoStream,
  frameRate: MediaRational,
  frameCount: number,
): boolean {
  const end = video.endPts;
  return video.timingStatus === "admissible"
    && video.startPts !== undefined && ticks(video.startPts.ticks) === 0n
    && end !== undefined && video.decodedUnitCount === frameCount
    && BigInt(end.ticks) * BigInt(end.timeBase.numerator) * BigInt(frameRate.numerator)
      === BigInt(frameCount) * BigInt(frameRate.denominator) * BigInt(end.timeBase.denominator);
}

/** Provider-private proof that copying preserves every planned decoded frame. */
export function normalizedVideoFrames(
  video: MediaVideoStream,
  frameRate: MediaRational,
  frameCount: number,
  frames: readonly VideoFrame[],
): boolean {
  if (!normalizedVideoSpan(video, frameRate, frameCount) || !video.timeBase
    || frames.length !== frameCount) return false;
  const numerator = BigInt(video.timeBase.numerator) * BigInt(frameRate.numerator);
  const denominator = BigInt(video.timeBase.denominator) * BigInt(frameRate.denominator);
  return frames.every((frame, index) => {
    const pts = ticks(frame.pts);
    const duration = ticks(frame.duration ?? frame.pkt_duration);
    return pts !== undefined && pts * numerator === BigInt(index) * denominator
      && duration !== undefined && duration * numerator === denominator
      && frame.width === video.width && frame.height === video.height && frame.pix_fmt === "yuv420p"
      && frame.sample_aspect_ratio === "1:1" && frame.interlaced_frame === 0
      && !frame.side_data_list?.some((side) => side.rotation !== undefined && side.rotation !== 0);
  });
}
