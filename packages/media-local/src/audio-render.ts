import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { open } from "node:fs/promises";

import { verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram, AudioProgramClip } from "@hypit/audio-program";
import { readAudioGainProcess } from "@hypit/composition";
import {
  compareExactTemporalValues,
  composeTemporalMaps,
  createTemporalMapEvaluator,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  isAffineTemporalMapPiece,
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

function exactNumber(value: ExactTemporalValue): number {
  const rational = exactTemporalRational(value);
  const result = Number(rational.numerator) / Number(rational.denominator);
  assert(Number.isFinite(result), "Audio temporal value exceeds finite renderer arithmetic");
  return result;
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

function positiveAffineSpan(map: TemporalMap, start: ExactTemporalValue, end: ExactTemporalValue, label: string): {
  readonly start: ExactTemporalValue;
  readonly end: ExactTemporalValue;
  readonly rate: number;
} {
  let left = start;
  let right = end;
  let totalRate = 1;
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
    totalRate *= piece.rate.numerator / piece.rate.denominator;
  }
  return { start: left, end: right, rate: totalRate };
}

/**
 * Resolve the exact Maps to the constant positive source span understood by
 * this Provider's pitch-preserving implementation. Other renderers may support
 * richer reconstruction without changing AudioProgram.
 */
export function planPositiveAffineReconstruction(clip: AudioProgramClip): PositiveAffineReconstructionPlan {
  const targetSampleFrames = clip.targetEndSampleExclusive - clip.targetStartSample;
  assert(targetSampleFrames > 0, `Audio Clip ${clip.id} has no target samples`);
  const sampled = positiveAffineSpan(clip.sampling, exactTemporalZero(),
    clip.sampling.stages[0]!.target.duration,
    `Audio Clip ${clip.id} sampling`);
  const prepared = positiveAffineSpan(clip.preparation, sampled.start, sampled.end,
    `Audio Clip ${clip.id} preparation`);
  const sourceStartSample = Math.round(exactNumber(prepared.start) * SAMPLE_RATE);
  const sourceEndSampleExclusive = Math.round(exactNumber(prepared.end) * SAMPLE_RATE);
  const rate = sampled.rate * prepared.rate;
  assert(Number.isFinite(rate) && rate > 0 && sourceStartSample >= 0
    && sourceEndSampleExclusive > sourceStartSample,
  `Audio Clip ${clip.id} has an invalid pitch-preserving source span`);
  return { sourceStartSample, sourceEndSampleExclusive, rate, targetSampleFrames };
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

type CompiledClip = {
  readonly clip: AudioProgramClip;
  readonly routeGain: number;
  readonly mapping: TemporalMapEvaluator;
  readonly source: SignalReader;
  readonly reconstructed?: SignalReader;
};

type SignalRoute = { readonly clip: AudioProgramClip; readonly gain: number };

function signalRoutes(program: AudioProgram): SignalRoute[] {
  const nodes = new Map(program.graph.nodes.map((node) => [node.id, node] as const));
  const routes: SignalRoute[] = [];
  const visits = [{ id: program.graph.output.node, gain: 1 }];
  while (visits.length > 0) {
    const visit = visits.pop()!;
    const node = nodes.get(visit.id)!;
    if (node.kind === "silence") continue;
    if (node.kind === "source") {
      routes.push({ clip: node.clip, gain: visit.gain });
      continue;
    }
    if (node.kind === "mix") {
      for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
        visits.push({ id: node.inputs[index]!.node, gain: visit.gain });
      }
      continue;
    }
    assert(Object.keys(node.inputs).every((port) => port === "signal"),
      `Audio Process ${node.id} has unsupported ports`);
    visits.push({ id: node.inputs.signal!.node,
      gain: visit.gain * readAudioGainProcess(node.program) });
  }
  return routes;
}

type SampleRange = { readonly startSample: number; readonly endSampleExclusive: number };
type PlannedClip = {
  readonly clip: AudioProgramClip;
  readonly gain: number;
  /** Shared by demand analysis and actual sample reads. */
  readonly mapping: TemporalMapEvaluator;
};

/** One request-local pull plan shared by source preparation and signal evaluation. */
export type AudioRenderPlan = {
  readonly program: AudioProgram;
  readonly ranges: readonly SampleRange[];
  readonly clips: readonly PlannedClip[];
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

function mapHasContent(evaluate: TemporalMapEvaluator, ranges: readonly SampleRange[]): boolean {
  return ranges.some((range) => {
    for (let sample = range.startSample; sample < range.endSampleExclusive; sample += 1) {
      if (evaluate(samplePosition(sample), "after") !== undefined) return true;
    }
    return false;
  });
}

function planProgram(program: AudioProgram, ranges: readonly SampleRange[]): AudioRenderPlan {
  const selected = mergeSampleRanges(ranges, program.sampleFrames);
  const clips = signalRoutes(program).flatMap((route): PlannedClip[] => {
    const local = localRanges(selected, route.clip.targetStartSample, route.clip.targetEndSampleExclusive);
    if (local.length === 0) return [];
    const mapping = createTemporalMapEvaluator(composeTemporalMaps(route.clip.sampling, route.clip.preparation));
    return mapHasContent(mapping, local) ? [{ clip: route.clip, gain: route.gain, mapping }] : [];
  });
  return { program, ranges: selected, clips };
}

export function planAudioProgramRender(
  program: AudioProgram,
  startSample: number,
  sampleFrames: number,
): AudioRenderPlan {
  verifyAudioProgram(program);
  assert(Number.isSafeInteger(startSample) && startSample >= 0
    && Number.isSafeInteger(sampleFrames) && sampleFrames >= 0
    && startSample + sampleFrames <= program.sampleFrames,
  "Audio renderer range lies outside its programme");
  return planProgram(program, [{ startSample, endSampleExclusive: startSample + sampleFrames }]);
}

export function audioRenderPlanSourceClips(plan: AudioRenderPlan): readonly AudioProgramClip[] {
  return plan.clips.map((entry) => entry.clip);
}

function levelAt(clip: AudioProgramClip, sample: number): number {
  let gain = clip.gain;
  const points = clip.gainEnvelope;
  if (points !== undefined) {
    let envelope = points.at(-1)!.gain;
    if (sample < points[0]!.sample) envelope = points[0]!.gain;
    else for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1]!;
      const right = points[index]!;
      if (sample < right.sample) {
        envelope = left.gain + (right.gain - left.gain) * (sample - left.sample) / (right.sample - left.sample);
        break;
      }
    }
    gain *= envelope;
  }
  if (clip.audibility !== undefined
    && !clip.audibility.some((span) => sample >= span.startSample && sample < span.endSampleExclusive)) return 0;
  if (clip.fadeInSamples > 0 && sample < clip.mixStartSample + clip.fadeInSamples) {
    gain *= Math.max(0, (sample - clip.mixStartSample) / clip.fadeInSamples);
  }
  if (clip.fadeOutSamples > 0 && sample >= clip.mixEndSampleExclusive - clip.fadeOutSamples) {
    gain *= Math.max(0, (clip.mixEndSampleExclusive - sample) / clip.fadeOutSamples);
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
  readonly #clips: readonly CompiledClip[];
  readonly #pages = new Map<number, SignalPage>();

  constructor(
    plan: AudioRenderPlan,
    sourceForClip: (clip: AudioProgramClip) => SignalReader,
    reconstructedForClip: ((clip: AudioProgramClip) => SignalReader | undefined) | undefined,
  ) {
    const program = plan.program;
    this.sampleFrames = program.sampleFrames;
    this.#clips = plan.clips.map(({ clip, gain, mapping }) => {
        const reconstructed = reconstructedForClip?.(clip);
        return {
          clip,
          routeGain: gain,
          mapping,
          source: sourceForClip(clip),
          ...(reconstructed === undefined ? {} : { reconstructed }),
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
    for (const entry of this.#clips) {
      const left = Math.max(start, entry.clip.targetStartSample);
      const right = Math.min(end, entry.clip.targetEndSampleExclusive);
      for (let sample = left; sample < right; sample += 1) {
        const level = levelAt(entry.clip, sample) * entry.routeGain;
        if (level === 0) continue;
        let sourcePosition: SignalPosition;
        let reader: SignalReader;
        if (entry.reconstructed !== undefined) {
          sourcePosition = {
            position: samplePosition(sample - entry.clip.targetStartSample),
            sourceSide: "after",
          };
          reader = entry.reconstructed;
        } else {
          const mapped = entry.mapping(samplePosition(sample - entry.clip.targetStartSample), "after");
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
 * chooses source position; pitch-preserving reconstruction is a separate,
 * explicit Clip programme and is never inferred here.
 */
export async function renderAudioProgramWav(options: {
  readonly path: string;
  readonly program: AudioProgram;
  readonly plan?: AudioRenderPlan;
  readonly startSample: number;
  readonly sampleFrames: number;
  readonly sourceForClip: (clip: AudioProgramClip) => CanonicalPcmReader;
  readonly reconstructedForClip?: (clip: AudioProgramClip) => CanonicalPcmReader | undefined;
}): Promise<void> {
  assert(options.startSample >= 0 && options.sampleFrames >= 0
    && options.startSample + options.sampleFrames <= options.program.sampleFrames,
  "Audio renderer range lies outside its programme");
  const plan = options.plan ?? planAudioProgramRender(options.program, options.startSample, options.sampleFrames);
  assert(plan.program === options.program, "Audio renderer plan belongs to another programme");
  const reader = new ProgramSignalReader(plan, options.sourceForClip, options.reconstructedForClip);
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    output = await open(options.path, "w");
    await output.write(wavHeader(options.sampleFrames));
    for (let blockStart = 0; blockStart < options.sampleFrames; blockStart += OUTPUT_BLOCK_FRAMES) {
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
  } finally {
    await output?.close();
  }
}
