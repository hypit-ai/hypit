import { verifyAudioProgram } from "@hypit/media-operations";
import type { AudioProgram } from "@hypit/media-operations";
import type { BlobRef } from "@hypit/hypit/protocol";

export type PlaybackResourceUrlResolver = (artifact: BlobRef) => string;

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Lower an AudioProgram into private elements consumed by the playback adapter. */
export function materializePlaybackAudio(
  program: AudioProgram,
  resolve: PlaybackResourceUrlResolver,
): string {
  verifyAudioProgram(program);
  return program.clips.map((clip) => `<audio class="hypit-playback-audio" preload="none"
    data-hypit-src="${attribute(resolve(clip.artifact))}"
    data-start="${clip.targetStartSample / 48_000}"
    data-duration="${(clip.targetEndSampleExclusive - clip.targetStartSample) / 48_000}"
    data-media-start="${clip.sourceStartSample / 48_000}"
    data-media-end="${clip.sourceEndSampleExclusive / 48_000}"
    data-loop="${clip.sourceLoop}"
    data-phase="${clip.sourcePhaseSample / 48_000}"
    data-playback-rate="${clip.playbackRate}"
    data-gain="${clip.gain}"
    data-level-automation="${encodeURIComponent(JSON.stringify({
      gainEnvelope: clip.gainEnvelope,
      audibility: clip.audibility,
      fadeInSamples: clip.fadeInSamples,
      fadeOutSamples: clip.fadeOutSamples,
      mixStartSample: clip.mixStartSample,
      mixEndSampleExclusive: clip.mixEndSampleExclusive,
    }))}"></audio>`).join("");
}
