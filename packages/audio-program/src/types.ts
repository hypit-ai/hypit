import type { AudioLevelAutomation, AudioReconstructionProgram } from "@hypit/composition";
import type { MediaRational, PreparedAudioSource } from "@hypit/media";
import type { FrameSpan } from "@hypit/timeline";
import type { TemporalMap, TemporalRange } from "@hypit/temporal";

export type AudioProgramClip = AudioLevelAutomation & {
  readonly id: string;
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
  /** Occurrence-local to PreparedMedia-local relation. Gaps are silence. */
  readonly sampling: TemporalMap;
  /** Explicit signal reconstruction; omission remains ordinary point sampling. */
  readonly reconstruction?: AudioReconstructionProgram;
  /** Exact absolute programme range; sample boundaries are its 48 kHz projection. */
  readonly target: TemporalRange;
  readonly targetStartSample: number;
  readonly targetEndSampleExclusive: number;
  /** Complete owning Clip Window; fades do not restart at sampling-piece boundaries. */
  readonly mixStartSample: number;
  readonly mixEndSampleExclusive: number;
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

/** Pure, provider-independent audio programme lowered from a closed Composition. */
export type AudioProgram = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
  readonly clips: readonly AudioProgramClip[];
};

export type RenderAudioNeed = {
  readonly program: AudioProgram;
  readonly range?: FrameSpan;
};
