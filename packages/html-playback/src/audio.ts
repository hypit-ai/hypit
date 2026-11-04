import {
  audioProgramUseSampleSpan,
  verifyAudioProgram,
} from "@hypit/audio-program";
import type { AudioProgram, AudioProgramMediaSource, AudioProgramSignalRef } from "@hypit/audio-program";
import { readAudioGainProgram } from "@hypit/audio-gain";
import type { AudioGainControl } from "@hypit/audio-gain";
import { readPreservePitch } from "@hypit/audio-preserve-pitch";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  composeTemporalMaps,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
  identityTemporalMap,
  isAffineTemporalMapPiece,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMap, TemporalRange } from "@hypit/temporal";

export type PlaybackResourceUrlResolver = (artifact: BlobRef) => string;

type PlaybackGainRoute = {
  readonly media: AudioProgramMediaSource;
  readonly sampling: TemporalMap;
  readonly target: TemporalRange;
  readonly gain: number;
  readonly controls: readonly PlaybackGainControl[];
  readonly reconstruction?: Extract<AudioProgram["graph"]["nodes"][number], { kind: "program" }>["reconstruction"];
};

type PlaybackGainControl = {
  readonly segments: readonly {
    readonly startSample: number;
    readonly endSampleExclusive: number;
    readonly from: number;
    readonly to: number;
  }[];
};

function identitySignalMapping(value: Parameters<typeof composeTemporalMaps>[0]): boolean {
  if (value.stages.length !== 1) return false;
  const stage = value.stages[0]!;
  if (stage.pieces.length !== 1 || !isAffineTemporalMapPiece(stage.pieces[0]!)) return false;
  const piece = stage.pieces[0]!;
  return piece.wrap === undefined
    && piece.rate.numerator === piece.rate.denominator
    && compareExactTemporalValues(piece.target.start, exactTemporalZero()) === 0
    && compareExactTemporalValues(piece.target.end, stage.target.duration) === 0
    && compareExactTemporalValues(piece.sourceAtStart, exactTemporalZero()) === 0
    && compareExactTemporalValues(stage.target.duration, stage.source.duration) === 0;
}

function playbackControl(control: AudioGainControl, offsetSamples: number): PlaybackGainControl {
  return { segments: control.segments.map((segment) => ({
    startSample: offsetSamples + sampleBoundary(segment.range.start, "Playback Gain Control start"),
    endSampleExclusive: offsetSamples + sampleBoundary(segment.range.end, "Playback Gain Control end"),
    from: segment.from,
    to: segment.to,
  })) };
}

function playbackGainRoutes(program: AudioProgram): readonly PlaybackGainRoute[] {
  const nodes = new Map(program.graph.nodes.map((node) => [node.id, node] as const));
  const route = (input: AudioProgramSignalRef, gain: number,
    controls: readonly PlaybackGainControl[]): PlaybackGainRoute[] => {
    const node = nodes.get(input.node)!;
    if (node.kind === "silence") return [];
    if (node.kind === "source") return [{
      media: node.media,
      sampling: identityTemporalMap(program.domain),
      target: { start: exactTemporalZero(), end: program.domain.duration },
      gain,
      controls,
    }];
    if (node.kind === "program") {
      const childRoutes = playbackGainRoutes(node.program);
      if (childRoutes.length !== 1) {
        throw new Error(`Browser playback does not support nested Audio Programme ${node.id}.`);
      }
      const child = childRoutes[0]!;
      if (compareExactTemporalValues(child.target.start, exactTemporalZero()) !== 0
        || compareExactTemporalValues(child.target.end, node.program.domain.duration) !== 0) {
        throw new Error(`Browser playback cannot flatten partial nested Audio Programme ${node.id}.`);
      }
      if (child.controls.length > 0 && !identitySignalMapping(node.sampling)) {
        throw new Error(`Browser playback cannot map controlled nested Audio Programme ${node.id}.`);
      }
      const offset = sampleBoundary(node.target.start, `Playback Audio Programme ${node.id} target start`);
      return [{
        media: child.media,
        sampling: identitySignalMapping(child.sampling)
          ? structuredClone(node.sampling)
          : composeTemporalMaps(node.sampling, child.sampling),
        target: node.target,
        gain: gain * child.gain,
        controls: [
          ...controls,
          ...child.controls.map((control) => ({ segments: control.segments.map((segment) => ({
            ...segment,
            startSample: segment.startSample + offset,
            endSampleExclusive: segment.endSampleExclusive + offset,
          })) })),
        ],
        ...(node.reconstruction === undefined ? {} : { reconstruction: node.reconstruction }),
      }];
    }
    if (node.kind === "restrict") {
      throw new Error(`Browser playback does not support Audio Restrict ${node.id}.`);
    }
    if (node.kind === "mix") return node.inputs.flatMap((entry) => route(entry, gain, controls));
    if (Object.keys(node.inputs).some((port) => port !== "signal")) {
      throw new Error(`Playback Audio Process ${node.id} has unsupported ports.`);
    }
    const value = readAudioGainProgram(node.program);
    if (value.kind === "constant") {
      const next = gain * value.gain;
      if (!Number.isFinite(next)) throw new Error(`Playback Audio Process ${node.id} produces non-finite gain.`);
      return route(node.inputs.signal!, next, controls);
    }
    if (Object.keys(node.controlMappings).join("\u0000") !== "gain"
      || !identitySignalMapping(node.controlMappings.gain!)) {
      throw new Error(`Browser playback cannot map Audio Gain Control ${node.id}.`);
    }
    return route(node.inputs.signal!, gain, [...controls, playbackControl(value.control, 0)]);
  };
  return route(program.graph.output, 1, []);
}

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
  return playbackGainRoutes(program).flatMap(({ media, sampling, target: targetRange,
    gain: routeGain, controls, reconstruction }) => {
    const target = audioProgramUseSampleSpan({ id: media.id, target: targetRange }, program.sampling);
    if (media.source.streamIndex !== 0) {
      throw new Error(`Browser playback cannot select audio stream ${media.source.streamIndex} for ${media.id}; use an audio renderer that executes the AudioProgram source plan`);
    }
    const preservePitch = reconstruction !== undefined;
    if (reconstruction !== undefined) readPreservePitch(reconstruction);
    if (sampling.stages.length !== 1) {
      throw new Error(`Playback audio ${media.id} supports one occurrence-to-prepared Map stage`);
    }
    if (!media.preparation.stages.every((stage) => stage.pieces.length === 1
      && isAffineTemporalMapPiece(stage.pieces[0]!)
      && stage.pieces[0]!.wrap === undefined && stage.pieces[0]!.rate.numerator > 0)) {
      throw new Error(`Playback audio ${media.id} preparation is not one positive affine chain`);
    }
    const sourceAt = (sample: number, side: "before" | "after"): number => {
      const mapped = evaluateTemporalMap(media.preparation,
        exactTemporalValue({ numerator: BigInt(sample), denominator: 48_000n }), side);
      if (mapped === undefined) throw new Error(`Playback audio ${media.id} sampling falls in a Prepared Media gap`);
      const absolute = exactTemporalRational(addExactTemporalValues(media.source.presentationStart, mapped.position));
      return Number(absolute.numerator) / Number(absolute.denominator);
    };
    return sampling.stages[0]!.pieces.map((piece, pieceIndex) => {
      if (!isAffineTemporalMapPiece(piece)) {
        throw new Error(`Playback audio ${media.id} piece ${pieceIndex} is outside this adapter's affine capability`);
      }
      if (piece.rate.numerator <= 0) {
        throw new Error(`Playback audio ${media.id} piece ${pieceIndex} requires a positive affine rate`);
      }
      const targetStart = sampleBoundary(addExactTemporalValues(targetRange.start, piece.target.start),
        `Playback audio ${media.id} piece ${pieceIndex} target start`);
      const targetEnd = sampleBoundary(addExactTemporalValues(targetRange.start, piece.target.end),
        `Playback audio ${media.id} piece ${pieceIndex} target end`);
      const sourceAtStart = sampleBoundary(piece.sourceAtStart,
        `Playback audio ${media.id} piece ${pieceIndex} source start`);
      const sourceAtEnd = sampleBoundary(addExactTemporalValues(piece.sourceAtStart,
        scaleExactTemporalValue(subtractExactTemporalValues(piece.target.end, piece.target.start), piece.rate)),
      `Playback audio ${media.id} piece ${pieceIndex} source end`);
      const preparedStart = piece.wrap === undefined ? sourceAtStart
        : sampleBoundary(piece.wrap.start, `Playback audio ${media.id} piece ${pieceIndex} wrap start`);
      const preparedEnd = piece.wrap === undefined ? sourceAtEnd
        : sampleBoundary(piece.wrap.end, `Playback audio ${media.id} piece ${pieceIndex} wrap end`);
      const phase = piece.wrap === undefined ? 0 : sourceAtStart - preparedStart;
      const sourceStart = sourceAt(preparedStart, "after");
      const sourceEnd = sourceAt(preparedEnd, "before");
      const preparedLength = (preparedEnd - preparedStart) / 48_000;
      const sourceRate = Math.abs(sourceEnd - sourceStart) / preparedLength;
      if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
        throw new Error(`Playback audio ${media.id} preparation is not one positive affine preview relation`);
      }
      return `<audio class="hypit-playback-audio" preload="none"
    data-hypit-src="${attribute(resolve(media.source.source))}"
    data-stream-index="${media.source.streamIndex}"
    data-start="${targetStart / 48_000}"
    data-duration="${(targetEnd - targetStart) / 48_000}"
    data-media-start="${sourceStart}"
    data-media-end="${sourceEnd}"
    data-loop="${piece.wrap !== undefined}"
    data-phase="${phase / 48_000}"
    data-playback-rate="${(piece.rate.numerator / piece.rate.denominator) * sourceRate}"
    data-preserves-pitch="${preservePitch}"
    data-gain="${routeGain}"
    data-gain-controls="${encodeURIComponent(JSON.stringify(controls))}"></audio>`;
    });
  }).join("");
}
