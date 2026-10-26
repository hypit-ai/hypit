import { verifyAudioProgram } from "@hypit/media-operations";
import type { AudioProgram } from "@hypit/media-operations";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  addExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValue,
} from "@hypit/temporal";

export type PlaybackResourceUrlResolver = (artifact: BlobRef) => string;

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Lower an AudioProgram into private elements consumed by the playback adapter. */
export function lowerPlaybackAudio(
  program: AudioProgram,
  resolve: PlaybackResourceUrlResolver,
): string {
  verifyAudioProgram(program);
  return program.clips.map((clip) => {
    const sourceAt = (sample: number): number => {
      const mapped = evaluateTemporalMap(clip.preparation,
        exactTemporalValue({ numerator: BigInt(sample), denominator: 48_000n }));
      if (mapped === undefined) throw new Error(`Playback audio ${clip.id} sampling falls in a Prepared Media gap`);
      const absolute = exactTemporalRational(addExactTemporalValues(clip.source.presentationStart, mapped));
      return Number(absolute.numerator) / Number(absolute.denominator);
    };
    const sourceStart = sourceAt(clip.preparedStartSample);
    const sourceEnd = sourceAt(clip.preparedEndSampleExclusive);
    const preparedLength = (clip.preparedEndSampleExclusive - clip.preparedStartSample) / 48_000;
    const sourceRate = Math.abs(sourceEnd - sourceStart) / preparedLength;
    return `<audio class="hypit-playback-audio" preload="none"
    data-hypit-src="${attribute(resolve(clip.source.source))}"
    data-stream-index="${clip.source.streamIndex}"
    data-start="${clip.targetStartSample / 48_000}"
    data-duration="${(clip.targetEndSampleExclusive - clip.targetStartSample) / 48_000}"
    data-media-start="${sourceStart}"
    data-media-end="${sourceEnd}"
    data-loop="${clip.loop}"
    data-phase="${clip.loopPhaseSample / 48_000}"
    data-playback-rate="${(clip.playbackRate.numerator / clip.playbackRate.denominator) * sourceRate}"
    data-gain="${clip.gain}"
    data-level-automation="${encodeURIComponent(JSON.stringify({
      gainEnvelope: clip.gainEnvelope,
      audibility: clip.audibility,
      fadeInSamples: clip.fadeInSamples,
      fadeOutSamples: clip.fadeOutSamples,
      mixStartSample: clip.mixStartSample,
      mixEndSampleExclusive: clip.mixEndSampleExclusive,
    }))}"></audio>`;
  }).join("");
}
