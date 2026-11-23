import { mediaPreviewSampleRate, waveformPeaksPerBlock, type MediaAudioPeaks } from "@hypit/media";
import type { SourcePreviewBlock } from "./source-preview.js";

type WaveformTier = {
  readonly resolution: number;
  readonly tiles: ReadonlyMap<number, MediaAudioPeaks>;
};

/** Prefer the finest complete tier. With only partial data, show the tier covering the most time. */
export function selectWaveformTier(blocks: readonly SourcePreviewBlock[], from: number, to: number): WaveformTier | undefined {
  const tiers = new Map<number, { tiles: Map<number, MediaAudioPeaks>; coverage: number }>();
  const first = Math.min(from, to) * mediaPreviewSampleRate;
  const last = Math.max(from, to) * mediaPreviewSampleRate;
  for (const block of blocks) {
    const envelope = block.envelope;
    if (envelope === undefined) continue;
    const resolution = envelope.samplesPerPeak;
    const tile = Math.round(block.start * mediaPreviewSampleRate / (resolution * waveformPeaksPerBlock));
    const start = tile * resolution * waveformPeaksPerBlock;
    const end = start + envelope.sampleCount;
    const tier = tiers.get(resolution) ?? { tiles: new Map(), coverage: 0 };
    tier.tiles.set(tile, envelope);
    tier.coverage += Math.max(0, Math.min(last, end) - Math.max(first, start));
    tiers.set(resolution, tier);
  }
  const best = [...tiers].filter(([, tier]) => tier.coverage > 0).sort(([a, left], [b, right]) => {
    // The last PCM bucket ends at the nearest sample on the accepted Media clock.
    const complete = (coverage: number) => coverage >= last - first - 0.5;
    if (complete(left.coverage) && complete(right.coverage)) return a - b;
    return right.coverage - left.coverage || a - b;
  })[0];
  return best === undefined ? undefined : { resolution: best[0], tiles: best[1].tiles };
}

/** Rasterize one piecewise-linear envelope on the source clock at any display scale. */
export function rasterizeWaveform(tier: WaveformTier, from: number, to: number, columns: number): Float32Array {
  const { resolution, tiles } = tier;
  const start = from * mediaPreviewSampleRate / resolution;
  const step = (to - from) * mediaPreviewSampleRate / resolution / columns;
  const samples = [...tiles].sort(([a], [b]) => a - b);
  const center = (index: number, tile: number, envelope: MediaAudioPeaks) => {
    const head = index - tile * waveformPeaksPerBlock;
    return index + Math.min(1, envelope.sampleCount / resolution - head) / 2;
  };
  const boundary = (at: number) => {
    const index = Math.floor(at);
    const tile = Math.floor(index / waveformPeaksPerBlock);
    const current = tiles.get(tile);
    if (current === undefined || index - tile * waveformPeaksPerBlock >= current.peaks.length) return 0;
    const here = center(index, tile, current);
    const amplitude = current.peaks[index - tile * waveformPeaksPerBlock]!;
    const adjacent = at < here ? index - 1 : index + 1;
    const nextTile = Math.floor(adjacent / waveformPeaksPerBlock);
    const next = tiles.get(nextTile);
    const other = next?.peaks[adjacent - nextTile * waveformPeaksPerBlock];
    if (next === undefined || other === undefined) return amplitude;
    const fraction = (at - here) / (center(adjacent, nextTile, next) - here);
    return amplitude + (other - amplitude) * fraction;
  };

  const result = new Float32Array(columns);
  // Traverse from the start of the source interval, even when the Item plays in reverse.
  const low = Math.min(start, to * mediaPreviewSampleRate / resolution);
  const width = Math.abs(step);
  let cursor = 0;
  for (let x = 0; x < columns; x += 1) {
    const left = low + x * width, right = low + (x + 1) * width;
    let peak = Math.max(boundary(left), boundary(right));
    while (cursor < samples.length && (samples[cursor]![0] + 1) * waveformPeaksPerBlock <= left) cursor += 1;
    for (let i = cursor; i < samples.length; i += 1) {
      const [tile, envelope] = samples[i]!;
      const offset = tile * waveformPeaksPerBlock;
      if (offset > right) break;
      const first = Math.max(0, Math.floor(left - offset));
      const last = Math.min(envelope.peaks.length - 1, Math.floor(right - offset));
      for (let j = first; j <= last; j += 1) {
        const at = center(offset + j, tile, envelope);
        if (at >= left && at <= right) peak = Math.max(peak, envelope.peaks[j]!);
      }
    }
    // Make quiet peaks readable in compact bands while keeping silence at zero.
    result[step >= 0 ? x : columns - 1 - x] = Math.cbrt(peak);
  }
  return result;
}
