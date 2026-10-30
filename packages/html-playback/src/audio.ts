import { audioProgramGainRoutes, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram } from "@hypit/audio-program";
import { readPreservePitch } from "@hypit/audio-stretch";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  addExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValue,
  isAffineTemporalMapPiece,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue } from "@hypit/temporal";

export type PlaybackResourceUrlResolver = (artifact: BlobRef) => string;

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sampleBoundary(value: ExactTemporalValue, label: string): number {
  const exact = exactTemporalRational(value);
  const numerator = exact.numerator * 48_000n;
  const rounded = numerator >= 0n
    ? (numerator * 2n + exact.denominator) / (exact.denominator * 2n)
    : -((-numerator * 2n + exact.denominator) / (exact.denominator * 2n));
  if (rounded < 0n || rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside preview sample arithmetic`);
  }
  return Number(rounded);
}

/** Lower an AudioProgram into private elements consumed by the playback adapter. */
export function lowerPlaybackAudio(
  program: AudioProgram,
  resolve: PlaybackResourceUrlResolver,
): string {
  verifyAudioProgram(program);
  return audioProgramGainRoutes(program).flatMap(({ clip, gain: routeGain }) => {
    if (clip.source.streamIndex !== 0) {
      throw new Error(`Browser playback cannot select audio stream ${clip.source.streamIndex} for ${clip.id}; use an audio renderer that executes the AudioProgram source plan`);
    }
    const preservePitch = clip.reconstruction !== undefined;
    if (clip.reconstruction !== undefined) readPreservePitch(clip.reconstruction);
    if (clip.sampling.stages.length !== 1) {
      throw new Error(`Playback audio ${clip.id} supports one occurrence-to-prepared Map stage`);
    }
    if (!clip.preparation.stages.every((stage) => stage.pieces.length === 1
      && isAffineTemporalMapPiece(stage.pieces[0]!)
      && stage.pieces[0]!.wrap === undefined && stage.pieces[0]!.rate.numerator > 0)) {
      throw new Error(`Playback audio ${clip.id} preparation is not one positive affine chain`);
    }
    const sourceAt = (sample: number, side: "before" | "after"): number => {
      const mapped = evaluateTemporalMap(clip.preparation,
        exactTemporalValue({ numerator: BigInt(sample), denominator: 48_000n }), side);
      if (mapped === undefined) throw new Error(`Playback audio ${clip.id} sampling falls in a Prepared Media gap`);
      const absolute = exactTemporalRational(addExactTemporalValues(clip.source.presentationStart, mapped.position));
      return Number(absolute.numerator) / Number(absolute.denominator);
    };
    return clip.sampling.stages[0]!.pieces.map((piece, pieceIndex) => {
      if (!isAffineTemporalMapPiece(piece)) {
        throw new Error(`Playback audio ${clip.id} piece ${pieceIndex} is outside this adapter's affine capability`);
      }
      if (piece.rate.numerator <= 0) {
        throw new Error(`Playback audio ${clip.id} piece ${pieceIndex} requires a positive affine rate`);
      }
      const targetStart = sampleBoundary(addExactTemporalValues(clip.target.start, piece.target.start),
        `Playback audio ${clip.id} piece ${pieceIndex} target start`);
      const targetEnd = sampleBoundary(addExactTemporalValues(clip.target.start, piece.target.end),
        `Playback audio ${clip.id} piece ${pieceIndex} target end`);
      const sourceAtStart = sampleBoundary(piece.sourceAtStart,
        `Playback audio ${clip.id} piece ${pieceIndex} source start`);
      const sourceAtEnd = sampleBoundary(addExactTemporalValues(piece.sourceAtStart,
        scaleExactTemporalValue(subtractExactTemporalValues(piece.target.end, piece.target.start), piece.rate)),
      `Playback audio ${clip.id} piece ${pieceIndex} source end`);
      const preparedStart = piece.wrap === undefined ? sourceAtStart
        : sampleBoundary(piece.wrap.start, `Playback audio ${clip.id} piece ${pieceIndex} wrap start`);
      const preparedEnd = piece.wrap === undefined ? sourceAtEnd
        : sampleBoundary(piece.wrap.end, `Playback audio ${clip.id} piece ${pieceIndex} wrap end`);
      const phase = piece.wrap === undefined ? 0 : sourceAtStart - preparedStart;
      const sourceStart = sourceAt(preparedStart, "after");
      const sourceEnd = sourceAt(preparedEnd, "before");
      const preparedLength = (preparedEnd - preparedStart) / 48_000;
      const sourceRate = Math.abs(sourceEnd - sourceStart) / preparedLength;
      if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
        throw new Error(`Playback audio ${clip.id} preparation is not one positive affine preview relation`);
      }
      return `<audio class="hypit-playback-audio" preload="none"
    data-hypit-src="${attribute(resolve(clip.source.source))}"
    data-stream-index="${clip.source.streamIndex}"
    data-start="${targetStart / 48_000}"
    data-duration="${(targetEnd - targetStart) / 48_000}"
    data-media-start="${sourceStart}"
    data-media-end="${sourceEnd}"
    data-loop="${piece.wrap !== undefined}"
    data-phase="${phase / 48_000}"
    data-playback-rate="${(piece.rate.numerator / piece.rate.denominator) * sourceRate}"
    data-preserves-pitch="${preservePitch}"
    data-gain="${clip.gain * routeGain}"
    data-level-automation="${encodeURIComponent(JSON.stringify({
      gainEnvelope: clip.gainEnvelope,
      audibility: clip.audibility,
      fadeInSamples: clip.fadeInSamples,
      fadeOutSamples: clip.fadeOutSamples,
      mixStartSample: clip.mixStartSample,
      mixEndSampleExclusive: clip.mixEndSampleExclusive,
    }))}"></audio>`;
    });
  }).join("");
}
