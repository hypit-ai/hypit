/** Level automation is measured on the complete 48 kHz program clock. */
export type AudioSampleSpan = { readonly startSample: number; readonly endSampleExclusive: number };
export type AudioGainPoint = { readonly sample: number; readonly gain: number };
export type AudioLevelAutomation = {
  /** Linear interpolation; hold the first/last gain outside the supplied points. */
  readonly gainEnvelope?: readonly AudioGainPoint[];
  /** Half-open audible regions; omission means the complete target, [] means silence. */
  readonly audibility?: readonly AudioSampleSpan[];
};

export function assertAudioLevelAutomation(value: AudioLevelAutomation, target: AudioSampleSpan,
  totalSamples = Number.MAX_SAFE_INTEGER): void {
  if (value.gainEnvelope !== undefined) {
    if (!Array.isArray(value.gainEnvelope) || value.gainEnvelope.length === 0) throw new Error("Audio gain envelope needs points.");
    let previous = -1;
    for (const point of value.gainEnvelope) {
      if (!Number.isSafeInteger(point.sample) || point.sample <= previous || point.sample > totalSamples
        || !Number.isFinite(point.gain) || point.gain < 0) throw new Error("Audio gain envelope point is invalid.");
      previous = point.sample;
    }
  }
  if (value.audibility !== undefined) {
    if (!Array.isArray(value.audibility)) throw new Error("Audio audibility must be sample intervals.");
    let previous = target.startSample;
    for (const span of value.audibility) {
      if (!Number.isSafeInteger(span.startSample) || span.startSample < previous
        || !Number.isSafeInteger(span.endSampleExclusive) || span.endSampleExclusive <= span.startSample
        || span.endSampleExclusive > target.endSampleExclusive) throw new Error("Audio audibility is outside its target or overlaps.");
      previous = span.endSampleExclusive;
    }
  }
}

export function audioEnvelopeGainAt(points: readonly AudioGainPoint[] | undefined, sample: number): number {
  if (points === undefined) return 1;
  const first = points[0];
  if (first === undefined) throw new Error("Audio gain envelope needs points.");
  if (sample <= first.sample) return first.gain;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]!, right = points[index]!;
    if (sample <= right.sample) return left.gain + (right.gain - left.gain) * (sample - left.sample) / (right.sample - left.sample);
  }
  return points.at(-1)!.gain;
}
