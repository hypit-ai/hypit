import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { open } from "node:fs/promises";

import {
  audioProgramSampleFrames,
  audioProgramUseSampleSpan,
  isPointwiseOperatorTemporalSupport,
  verifyAudioProgram,
} from "@hypit/audio-program";
import type { AudioProgram, AudioProgramMediaSource, AudioProgramNode } from "@hypit/audio-program";
import {
  evaluateAudioGainControl,
  readAudioGainProgram,
  type AudioGainControl,
} from "@hypit/audio-gain";
import {
  compareExactTemporalValues,
  composeTemporalMaps,
  createTemporalMapEvaluator,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  isAffineTemporalMapPiece,
  resolveTemporalBoundary,
  temporalMapMayContain,
} from "@hypit/temporal";
import type {
  ExactTemporalValue,
  TemporalMap,
  TemporalMapEvaluator,
  TemporalMapSide,
} from "@hypit/temporal";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_FRAME = CHANNELS * BYTES_PER_SAMPLE;
const PAGE_FRAMES = 4_096;
const MAX_PAGES = 8;
const OUTPUT_BLOCK_FRAMES = 8_192;
const SAMPLE_CLOCK = { frameRate: { numerator: SAMPLE_RATE, denominator: 1 } } as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type SignalPosition = {
  readonly position: ExactTemporalValue;
  readonly sourceSide: TemporalMapSide;
};

function samplePosition(sample: number): ExactTemporalValue {
  return exactTemporalValueFromFrames(sample, SAMPLE_CLOCK);
}

function sampleCoordinate(
  value: SignalPosition,
  sampleFrames: number,
): { readonly left: number; readonly right: number; readonly fraction: number } {
  assert(sampleFrames > 0, "Audio renderer cannot sample an empty signal");
  const seconds = exactTemporalRational(value.position);
  let numerator = seconds.numerator * BigInt(SAMPLE_RATE);
  const denominator = seconds.denominator;
  if (value.sourceSide === "before" && numerator > 0n && numerator % denominator === 0n) {
    numerator -= denominator;
  }
  if (numerator <= 0n) return { left: 0, right: 0, fraction: 0 };
  const last = BigInt(sampleFrames - 1);
  if (numerator >= last * denominator) {
    const frame = Number(last);
    return { left: frame, right: frame, fraction: 0 };
  }
  const left = Number(numerator / denominator);
  const remainder = numerator % denominator;
  return {
    left,
    right: remainder === 0n ? left : left + 1,
    fraction: Number(remainder) / Number(denominator),
  };
}

export type PositiveAffineReconstructionPlan = {
  readonly sourceStartSample: number;
  readonly sourceEndSampleExclusive: number;
  readonly rate: number;
  readonly targetSampleFrames: number;
};

type PositiveRational = { readonly numerator: bigint; readonly denominator: bigint };

function gcd(left: bigint, right: bigint): bigint {
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function multiplyPositiveRational(
  left: PositiveRational,
  right: { readonly numerator: number | bigint; readonly denominator: number | bigint },
): PositiveRational {
  const numerator = left.numerator * BigInt(right.numerator);
  const denominator = left.denominator * BigInt(right.denominator);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** The exact relation ends here; FFmpeg's atempo interface accepts only a floating parameter. */
function finiteRate(value: PositiveRational): number {
  const bits = Math.max(value.numerator.toString(2).length, value.denominator.toString(2).length);
  const shift = BigInt(Math.max(0, bits - 900));
  const rate = Number(value.numerator >> shift) / Number(value.denominator >> shift);
  assert(Number.isFinite(rate) && rate > 0, "Pitch-preserving rate exceeds finite FFmpeg arithmetic");
  return rate;
}

function positiveAffineSpan(map: TemporalMap, start: ExactTemporalValue, end: ExactTemporalValue, label: string): {
  readonly start: ExactTemporalValue;
  readonly end: ExactTemporalValue;
  readonly rate: PositiveRational;
} {
  let left = start;
  let right = end;
  let totalRate: PositiveRational = { numerator: 1n, denominator: 1n };
  for (const [index, stage] of map.stages.entries()) {
    const piece = stage.pieces.find((candidate) =>
      compareExactTemporalValues(candidate.target.start, left) <= 0
      && compareExactTemporalValues(candidate.target.end, right) >= 0);
    assert(piece !== undefined,
      `${label} stage ${index} crosses a gap or piece boundary unsupported by pitch-preserving reconstruction`);
    assert(isAffineTemporalMapPiece(piece) && piece.wrap === undefined && piece.rate.numerator > 0,
      `${label} stage ${index} must be one positive affine, non-looping relation for pitch-preserving reconstruction`);
    const oneStage = { stages: [{ ...stage, pieces: [piece] }] };
    const projectedLeft = evaluateTemporalMap(oneStage, left, "after");
    const projectedRight = evaluateTemporalMap(oneStage, right, "before");
    assert(projectedLeft !== undefined && projectedRight !== undefined,
      `${label} stage ${index} cannot project its selected span`);
    left = projectedLeft.position;
    right = projectedRight.position;
    totalRate = multiplyPositiveRational(totalRate, piece.rate);
  }
  return { start: left, end: right, rate: totalRate };
}

export type DirectProgrammeReconstructionPlan = PositiveAffineReconstructionPlan & {
  readonly media: AudioProgramMediaSource;
};

/**
 * Current local capability for reconstruction on a mapped Programme use.
 * It is deliberately narrow: the child must be exactly one full-domain media leaf.
 */
export function planDirectProgrammeReconstruction(
  node: Extract<AudioProgramNode, { readonly kind: "program" }>,
  sampling: AudioProgram["sampling"],
): DirectProgrammeReconstructionPlan {
  const child = node.program;
  const source = child.graph.nodes.find((candidate) => candidate.kind === "source");
  assert(child.graph.nodes.length === 1 && source?.kind === "source"
    && child.graph.output.node === source.id,
  `Audio Programme use ${node.id} reconstruction requires one direct media Source`);
  const relation = composeTemporalMaps(
    node.sampling,
    source.media.preparation,
  );
  const target = audioProgramUseSampleSpan(node, sampling);
  const targetSampleFrames = target.endSampleExclusive - target.startSample;
  assert(targetSampleFrames > 0, `Audio Programme use ${node.id} has no target samples`);
  const mapped = positiveAffineSpan(
    relation,
    exactTemporalZero(),
    relation.stages[0]!.target.duration,
    `Audio Programme use ${node.id} sampling`,
  );
  const sourceStartSample = resolveTemporalBoundary(mapped.start, SAMPLE_CLOCK, "nearest");
  const sourceEndSampleExclusive = resolveTemporalBoundary(mapped.end, SAMPLE_CLOCK, "nearest");
  const rate = finiteRate(mapped.rate);
  assert(sourceStartSample >= 0 && sourceEndSampleExclusive > sourceStartSample,
    `Audio Programme use ${node.id} has an invalid pitch-preserving source span`);
  return { media: source.media, sourceStartSample, sourceEndSampleExclusive, rate, targetSampleFrames };
}

type Page = { readonly index: number; readonly frames: number; readonly bytes: Buffer };

/** Request-private, bounded random access to one decoded 48 kHz stereo PCM source. */
export class CanonicalPcmReader {
  readonly sampleFrames: number;
  readonly #fd: number;
  readonly #dataOffset: number;
  readonly #pages = new Map<number, Page>();

  constructor(path: string, expectedSampleFrames: number) {
    this.#fd = openSync(path, "r");
    try {
      const header = Buffer.alloc(12);
      assert(readSync(this.#fd, header, 0, header.length, 0) === header.length
        && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE",
      "Audio renderer decoded source is not RIFF/WAVE");
      let offset = 12;
      let format = false;
      let dataOffset: number | undefined;
      let dataBytes: number | undefined;
      const size = fstatSync(this.#fd).size;
      while (offset + 8 <= size) {
        const chunk = Buffer.alloc(8);
        assert(readSync(this.#fd, chunk, 0, 8, offset) === 8, "Audio renderer WAV chunk is truncated");
        const id = chunk.toString("ascii", 0, 4);
        const length = chunk.readUInt32LE(4);
        const body = offset + 8;
        assert(body + length <= size, "Audio renderer WAV chunk exceeds its file");
        if (id === "fmt ") {
          assert(length >= 16, "Audio renderer WAV format is truncated");
          const value = Buffer.alloc(16);
          assert(readSync(this.#fd, value, 0, 16, body) === 16, "Audio renderer WAV format is unavailable");
          assert(value.readUInt16LE(0) === 1 && value.readUInt16LE(2) === CHANNELS
            && value.readUInt32LE(4) === SAMPLE_RATE && value.readUInt16LE(12) === BYTES_PER_FRAME
            && value.readUInt16LE(14) === 16,
          "Audio renderer decoded source must be 48 kHz stereo PCM s16");
          format = true;
        } else if (id === "data") {
          dataOffset = body;
          dataBytes = length;
          break;
        }
        offset = body + length + (length % 2);
      }
      assert(format && dataOffset !== undefined && dataBytes !== undefined
        && dataBytes % BYTES_PER_FRAME === 0,
      "Audio renderer decoded source has no canonical PCM data");
      this.sampleFrames = dataBytes / BYTES_PER_FRAME;
      assert(this.sampleFrames === expectedSampleFrames,
        "Audio renderer decoded source sample count differs from its source domain");
      this.#dataOffset = dataOffset;
    } catch (error) {
      closeSync(this.#fd);
      throw error;
    }
  }

  close(): void {
    closeSync(this.#fd);
    this.#pages.clear();
  }

  #page(index: number): Page {
    const cached = this.#pages.get(index);
    if (cached !== undefined) {
      this.#pages.delete(index);
      this.#pages.set(index, cached);
      return cached;
    }
    const startFrame = index * PAGE_FRAMES;
    const frames = Math.min(PAGE_FRAMES, this.sampleFrames - startFrame);
    assert(frames > 0, "Audio renderer requested a source page outside its signal");
    const bytes = Buffer.allocUnsafe(frames * BYTES_PER_FRAME);
    assert(readSync(this.#fd, bytes, 0, bytes.length,
      this.#dataOffset + startFrame * BYTES_PER_FRAME) === bytes.length,
    "Audio renderer source page is truncated");
    const page = { index, frames, bytes };
    this.#pages.set(index, page);
    while (this.#pages.size > MAX_PAGES) this.#pages.delete(this.#pages.keys().next().value!);
    return page;
  }

  #sample(frame: number, channel: 0 | 1): number {
    const page = this.#page(Math.floor(frame / PAGE_FRAMES));
    const local = frame - page.index * PAGE_FRAMES;
    assert(local >= 0 && local < page.frames, "Audio renderer source sample lies outside its page");
    return page.bytes.readInt16LE(local * BYTES_PER_FRAME + channel * BYTES_PER_SAMPLE);
  }

  sample(position: SignalPosition, channel: 0 | 1): number {
    const { left, right, fraction } = sampleCoordinate(position, this.sampleFrames);
    const a = this.#sample(left, channel);
    if (fraction === 0 || right === left) return a;
    return a + (this.#sample(right, channel) - a) * fraction;
  }
}

type CompiledMedia = {
  readonly kind: "media";
  readonly media: AudioProgramMediaSource;
  readonly target: SampleRange;
  readonly routeGain: number;
  readonly gainControls: readonly GainControlUse[];
  readonly mapping: TemporalMapEvaluator;
  readonly source: SignalReader;
};

type CompiledProgram = {
  readonly kind: "program";
  readonly target: SampleRange;
  readonly routeGain: number;
  readonly gainControls: readonly GainControlUse[];
  readonly mapping: TemporalMapEvaluator;
  readonly source: SignalReader;
  readonly reconstructed?: SignalReader;
};

type CompiledRoute = CompiledMedia | CompiledProgram;

type SignalRoute =
  | { readonly kind: "media"; readonly media: AudioProgramMediaSource;
      readonly gain: number; readonly gainControls: readonly GainControlUse[]; readonly support: SampleRange }
  | { readonly kind: "program";
      readonly node: Extract<AudioProgramNode, { readonly kind: "program" }>;
      readonly gain: number; readonly gainControls: readonly GainControlUse[]; readonly support: SampleRange };

type GainControlUse = {
  readonly control: AudioGainControl;
  readonly mapping: TemporalMapEvaluator;
};

function signalRoutes(program: AudioProgram): SignalRoute[] {
  const nodes = new Map(program.graph.nodes.map((node) => [node.id, node] as const));
  const routes: SignalRoute[] = [];
  const visits: Array<{ readonly id: string; readonly gain: number;
    readonly gainControls: readonly GainControlUse[]; readonly support: SampleRange }> = [{
    id: program.graph.output.node, gain: 1, gainControls: [],
    support: { startSample: 0, endSampleExclusive: audioProgramSampleFrames(program) } }];
  while (visits.length > 0) {
    const visit = visits.pop()!;
    const node = nodes.get(visit.id)!;
    if (node.kind === "silence") continue;
    if (node.kind === "source") {
      routes.push({ kind: "media", media: node.media, gain: visit.gain,
        gainControls: visit.gainControls, support: visit.support });
      continue;
    }
    if (node.kind === "program") {
      routes.push({ kind: "program", node, gain: visit.gain,
        gainControls: visit.gainControls, support: visit.support });
      continue;
    }
    if (node.kind === "restrict") {
      const restriction = {
        startSample: resolveTemporalBoundary(node.range.start,
          { frameRate: { numerator: program.sampling.sampleRate, denominator: 1 } }, "nearest"),
        endSampleExclusive: resolveTemporalBoundary(node.range.end,
          { frameRate: { numerator: program.sampling.sampleRate, denominator: 1 } }, "nearest"),
      };
      visits.push({ id: node.input.node, gain: visit.gain, gainControls: visit.gainControls, support: {
        startSample: Math.max(visit.support.startSample, restriction.startSample),
        endSampleExclusive: Math.min(visit.support.endSampleExclusive, restriction.endSampleExclusive),
      } });
      continue;
    }
    if (node.kind === "mix") {
      for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
        visits.push({ id: node.inputs[index]!.node, gain: visit.gain,
          gainControls: visit.gainControls, support: visit.support });
      }
      continue;
    }
    assert(Object.keys(node.inputs).every((port) => port === "signal"),
      `Audio Process ${node.id} has unsupported ports`);
    assert(isPointwiseOperatorTemporalSupport(node.temporalSupport),
      `Audio Process ${node.id} requires unsupported non-pointwise temporal support`);
    const gain = readAudioGainProgram(node.program);
    if (gain.kind === "constant") {
      visits.push({ id: node.inputs.signal!.node,
        gain: visit.gain * gain.gain, gainControls: visit.gainControls, support: visit.support });
      continue;
    }
    assert(Object.keys(node.controlMappings).join("\u0000") === "gain",
      `Audio Gain Process ${node.id} requires exactly one gain Control mapping`);
    const mapping = node.controlMappings.gain!;
    const source = mapping.stages.at(-1)!.source;
    assert(source.id === gain.control.domain.id
      && compareExactTemporalValues(source.duration, gain.control.domain.duration) === 0,
    `Audio Gain Process ${node.id} Control mapping does not end in ${gain.control.domain.id}`);
    visits.push({ id: node.inputs.signal!.node, gain: visit.gain,
      gainControls: [...visit.gainControls, {
        control: gain.control,
        mapping: createTemporalMapEvaluator(mapping),
      }], support: visit.support });
  }
  return routes;
}

type SampleRange = { readonly startSample: number; readonly endSampleExclusive: number };
type PlannedMedia = {
  readonly kind: "media";
  readonly media: AudioProgramMediaSource;
  readonly target: SampleRange;
  readonly gain: number;
  readonly gainControls: readonly GainControlUse[];
  /** Shared by demand analysis and actual sample reads. */
  readonly mapping: TemporalMapEvaluator;
};

type PlannedProgram = {
  readonly kind: "program";
  readonly node: Extract<AudioProgramNode, { readonly kind: "program" }>;
  readonly target: SampleRange;
  readonly gain: number;
  readonly gainControls: readonly GainControlUse[];
  readonly mapping: TemporalMapEvaluator;
  readonly plan: AudioRenderPlan;
};

type PlannedRoute = PlannedMedia | PlannedProgram;

/** One request-local pull plan shared by source preparation and signal evaluation. */
export type AudioRenderPlan = {
  readonly program: AudioProgram;
  readonly ranges: readonly SampleRange[];
  readonly routes: readonly PlannedRoute[];
  readonly media: readonly PlannedMedia[];
};

function mergeSampleRanges(ranges: readonly SampleRange[], limit: number): SampleRange[] {
  const result: SampleRange[] = [];
  for (const range of ranges
    .map((item) => ({ startSample: Math.max(0, item.startSample),
      endSampleExclusive: Math.min(limit, item.endSampleExclusive) }))
    .filter((item) => item.endSampleExclusive > item.startSample)
    .toSorted((left, right) => left.startSample - right.startSample)) {
    const previous = result.at(-1);
    if (previous !== undefined && range.startSample <= previous.endSampleExclusive) {
      result[result.length - 1] = { startSample: previous.startSample,
        endSampleExclusive: Math.max(previous.endSampleExclusive, range.endSampleExclusive) };
    } else result.push(range);
  }
  return result;
}

function localRanges(
  selected: readonly SampleRange[],
  targetStartSample: number,
  targetEndSampleExclusive: number,
): SampleRange[] {
  return selected.flatMap((range): SampleRange[] => {
    const start = Math.max(range.startSample, targetStartSample);
    const end = Math.min(range.endSampleExclusive, targetEndSampleExclusive);
    return end <= start ? [] : [{
      startSample: start - targetStartSample,
      endSampleExclusive: end - targetStartSample,
    }];
  });
}

function mapHasContent(map: TemporalMap, ranges: readonly SampleRange[]): boolean {
  return ranges.some((range) => temporalMapMayContain(map, {
    start: samplePosition(range.startSample),
    end: samplePosition(range.endSampleExclusive),
  }));
}

function planProgram(program: AudioProgram, ranges: readonly SampleRange[]): AudioRenderPlan {
  const selected = mergeSampleRanges(ranges, audioProgramSampleFrames(program));
  const routes = signalRoutes(program).flatMap((route): PlannedRoute[] => {
    const target = route.kind === "media"
      ? { startSample: 0, endSampleExclusive: audioProgramSampleFrames(program) }
      : audioProgramUseSampleSpan(route.node, program.sampling);
    const supported = selected.flatMap((range): SampleRange[] => {
      const startSample = Math.max(range.startSample, route.support.startSample);
      const endSampleExclusive = Math.min(range.endSampleExclusive, route.support.endSampleExclusive);
      return endSampleExclusive <= startSample ? [] : [{ startSample, endSampleExclusive }];
    });
    const local = localRanges(supported, target.startSample, target.endSampleExclusive);
    if (local.length === 0) return [];
    const map = route.kind === "media"
      ? route.media.preparation
      : route.node.sampling;
    const mapping = createTemporalMapEvaluator(map);
    if (!mapHasContent(map, local)) return [];
    if (route.kind === "media") {
      return [{ kind: "media", media: route.media, target, gain: route.gain,
        gainControls: route.gainControls, mapping }];
    }
    return [{
      kind: "program",
      node: route.node,
      target,
      gain: route.gain,
      gainControls: route.gainControls,
      mapping,
      plan: planProgram(route.node.program, [{
        startSample: 0,
        endSampleExclusive: audioProgramSampleFrames(route.node.program),
      }]),
    }];
  });
  const media = routes.flatMap((route): readonly PlannedMedia[] =>
    route.kind === "media" ? [route] : route.plan.media);
  return { program, ranges: selected, routes, media };
}

export function planAudioProgramRender(
  program: AudioProgram,
  startSample: number,
  sampleFrames: number,
): AudioRenderPlan {
  verifyAudioProgram(program);
  assert(Number.isSafeInteger(startSample) && startSample >= 0
    && Number.isSafeInteger(sampleFrames) && sampleFrames >= 0
    && startSample + sampleFrames <= audioProgramSampleFrames(program),
  "Audio renderer range lies outside its programme");
  return planProgram(program, [{ startSample, endSampleExclusive: startSample + sampleFrames }]);
}

export function audioRenderPlanMediaSources(plan: AudioRenderPlan): readonly AudioProgramMediaSource[] {
  return plan.media.map((entry) => entry.media);
}

/** Demanded mapped Programme uses that explicitly request package-owned reconstruction. */
export function audioRenderPlanReconstructionUses(
  plan: AudioRenderPlan,
): readonly Extract<AudioProgramNode, { readonly kind: "program" }>[] {
  return plan.routes.flatMap((route): readonly Extract<AudioProgramNode, { readonly kind: "program" }>[] =>
    route.kind === "media"
      ? []
      : [
          ...(route.node.reconstruction === undefined ? [] : [route.node]),
          ...audioRenderPlanReconstructionUses(route.plan),
        ]);
}

function controlledGainAt(controls: readonly GainControlUse[], sample: number): number {
  let gain = 1;
  for (const use of controls) {
    const position = use.mapping(samplePosition(sample), "after");
    if (position === undefined) return 0;
    gain *= evaluateAudioGainControl(use.control, position.position);
  }
  return gain;
}

function wavHeader(sampleFrames: number): Buffer {
  const dataBytes = sampleFrames * BYTES_PER_FRAME;
  assert(Number.isSafeInteger(dataBytes) && dataBytes <= 0xffff_ffff - 36,
    "Audio renderer output exceeds the RIFF/WAVE size range");
  const value = Buffer.alloc(44);
  value.write("RIFF", 0); value.writeUInt32LE(36 + dataBytes, 4); value.write("WAVE", 8);
  value.write("fmt ", 12); value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20);
  value.writeUInt16LE(CHANNELS, 22); value.writeUInt32LE(SAMPLE_RATE, 24);
  value.writeUInt32LE(SAMPLE_RATE * BYTES_PER_FRAME, 28); value.writeUInt16LE(BYTES_PER_FRAME, 32);
  value.writeUInt16LE(16, 34); value.write("data", 36); value.writeUInt32LE(dataBytes, 40);
  return value;
}

function pcm16(value: number): number {
  return Math.max(-32_768, Math.min(32_767, Math.round(value)));
}

type SignalReader = {
  readonly sampleFrames: number;
  sample(position: SignalPosition, channel: 0 | 1): number;
};

type SignalPage = {
  readonly index: number;
  readonly frames: number;
  readonly samples: Float64Array;
};

/** Request-local lazy evaluation of one closed AudioProgram. */
class ProgramSignalReader implements SignalReader {
  readonly sampleFrames: number;
  readonly #routes: readonly CompiledRoute[];
  readonly #pages = new Map<number, SignalPage>();

  constructor(
    plan: AudioRenderPlan,
    sourceForMedia: (media: AudioProgramMediaSource) => SignalReader,
    reconstructedForProgram:
      ((node: Extract<AudioProgramNode, { readonly kind: "program" }>) => SignalReader | undefined)
      | undefined,
  ) {
    const program = plan.program;
    this.sampleFrames = audioProgramSampleFrames(program);
    this.#routes = plan.routes.map((route): CompiledRoute => {
      if (route.kind === "program") {
        const reconstructed = reconstructedForProgram?.(route.node);
        return {
          kind: "program",
          target: route.target,
          routeGain: route.gain,
          gainControls: route.gainControls,
          mapping: route.mapping,
          source: reconstructed ?? new ProgramSignalReader(
            route.plan, sourceForMedia, reconstructedForProgram,
          ),
          ...(reconstructed === undefined ? {} : { reconstructed }),
        };
      }
      const { media, target, gain, mapping } = route;
      return {
        kind: "media",
        media,
        target,
        routeGain: gain,
        gainControls: route.gainControls,
        mapping,
        source: sourceForMedia(media),
      };
    });
  }

  #page(index: number): SignalPage {
    const cached = this.#pages.get(index);
    if (cached !== undefined) {
      this.#pages.delete(index);
      this.#pages.set(index, cached);
      return cached;
    }
    const start = index * PAGE_FRAMES;
    const frames = Math.min(PAGE_FRAMES, this.sampleFrames - start);
    assert(frames > 0, "Audio renderer requested a programme page outside its signal");
    const end = start + frames;
    const samples = new Float64Array(frames * CHANNELS);
    for (const entry of this.#routes) {
      const left = Math.max(start, entry.target.startSample);
      const right = Math.min(end, entry.target.endSampleExclusive);
      for (let sample = left; sample < right; sample += 1) {
        const level = entry.routeGain * controlledGainAt(entry.gainControls, sample);
        if (level === 0) continue;
        let sourcePosition: SignalPosition;
        let reader: SignalReader;
        if (entry.kind === "program" && entry.reconstructed !== undefined) {
          sourcePosition = {
            position: samplePosition(sample - entry.target.startSample),
            sourceSide: "after",
          };
          reader = entry.reconstructed;
        } else {
          const mapped = entry.mapping(samplePosition(sample - entry.target.startSample), "after");
          if (mapped === undefined) continue;
          sourcePosition = mapped;
          reader = entry.source;
        }
        const offset = (sample - start) * CHANNELS;
        samples[offset] = samples[offset]! + reader.sample(sourcePosition, 0) * level;
        samples[offset + 1] = samples[offset + 1]! + reader.sample(sourcePosition, 1) * level;
      }
    }
    const page = { index, frames, samples };
    this.#pages.set(index, page);
    while (this.#pages.size > MAX_PAGES) this.#pages.delete(this.#pages.keys().next().value!);
    return page;
  }

  #sampleFrame(frame: number, channel: 0 | 1): number {
    const page = this.#page(Math.floor(frame / PAGE_FRAMES));
    const local = frame - page.index * PAGE_FRAMES;
    assert(local >= 0 && local < page.frames, "Audio renderer programme sample lies outside its page");
    return page.samples[local * CHANNELS + channel]!;
  }

  sample(position: SignalPosition, channel: 0 | 1): number {
    const { left, right, fraction } = sampleCoordinate(position, this.sampleFrames);
    const a = this.#sampleFrame(left, channel);
    if (fraction === 0 || right === left) return a;
    return a + (this.#sampleFrame(right, channel) - a) * fraction;
  }
}

/**
 * Evaluate one renderer-facing AudioProgram as a signal pullback. TemporalMap
 * chooses source position; reconstruction is an explicit mapped Programme-use
 * policy and is never inferred from the Mapping.
 */
export async function renderAudioProgramWav(options: {
  readonly path: string;
  readonly program: AudioProgram;
  readonly plan?: AudioRenderPlan;
  readonly startSample: number;
  readonly sampleFrames: number;
  readonly sourceForMedia: (media: AudioProgramMediaSource) => CanonicalPcmReader;
  readonly reconstructedForProgram?: (
    node: Extract<AudioProgramNode, { readonly kind: "program" }>,
  ) => CanonicalPcmReader | undefined;
  readonly signal?: AbortSignal;
}): Promise<void> {
  options.signal?.throwIfAborted();
  assert(options.startSample >= 0 && options.sampleFrames >= 0
    && options.startSample + options.sampleFrames <= audioProgramSampleFrames(options.program),
  "Audio renderer range lies outside its programme");
  const plan = options.plan ?? planAudioProgramRender(options.program, options.startSample, options.sampleFrames);
  assert(plan.program === options.program, "Audio renderer plan belongs to another programme");
  const reader = new ProgramSignalReader(
    plan,
    options.sourceForMedia,
    options.reconstructedForProgram,
  );
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    output = await open(options.path, "w");
    await output.write(wavHeader(options.sampleFrames));
    for (let blockStart = 0; blockStart < options.sampleFrames; blockStart += OUTPUT_BLOCK_FRAMES) {
      options.signal?.throwIfAborted();
      const frames = Math.min(OUTPUT_BLOCK_FRAMES, options.sampleFrames - blockStart);
      const absoluteStart = options.startSample + blockStart;
      const bytes = Buffer.allocUnsafe(frames * BYTES_PER_FRAME);
      for (let frame = 0; frame < frames; frame += 1) for (const channel of [0, 1] as const) {
        bytes.writeInt16LE(pcm16(reader.sample({
          position: samplePosition(absoluteStart + frame),
          sourceSide: "after",
        }, channel)),
          (frame * CHANNELS + channel) * BYTES_PER_SAMPLE);
      }
      await output.write(bytes);
    }
    options.signal?.throwIfAborted();
  } finally {
    await output?.close();
  }
}
