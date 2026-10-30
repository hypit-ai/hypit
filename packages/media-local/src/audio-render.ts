import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { open } from "node:fs/promises";

import type { AudioProgram, AudioProgramClip, AudioProgramNode } from "@hypit/audio-program";
import { readAudioGainProcess } from "@hypit/composition";
import { exactTemporalRational, temporalSampleContains } from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMap, TemporalMapPiece } from "@hypit/temporal";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_FRAME = CHANNELS * BYTES_PER_SAMPLE;
const PAGE_FRAMES = 4_096;
const MAX_PAGES = 8;
const OUTPUT_BLOCK_FRAMES = 8_192;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exactNumber(value: ExactTemporalValue): number {
  const rational = exactTemporalRational(value);
  const result = Number(rational.numerator) / Number(rational.denominator);
  assert(Number.isFinite(result), "Audio temporal value exceeds finite renderer arithmetic");
  return result;
}

type NumericPiece = {
  readonly targetStart: number;
  readonly targetEnd: number;
  readonly sourceAtStart: number;
} & (
  | {
      readonly kind: "affine";
      readonly rate: number;
      readonly wrap?: { readonly start: number; readonly end: number };
    }
  | {
      readonly kind: "cubic";
      readonly sourceControl1: number;
      readonly sourceControl2: number;
      readonly sourceAtEnd: number;
    }
);

type NumericStage = {
  readonly sourceDuration: number;
  readonly pieces: readonly NumericPiece[];
};

type NumericMap = {
  readonly stages: readonly NumericStage[];
};

export type PositiveAffineReconstructionPlan = {
  readonly sourceStartSample: number;
  readonly sourceEndSampleExclusive: number;
  readonly rate: number;
  readonly targetSampleFrames: number;
};

function numericPiece(piece: TemporalMapPiece): NumericPiece {
  const common = {
    targetStart: exactNumber(piece.target.start),
    targetEnd: exactNumber(piece.target.end),
    sourceAtStart: exactNumber(piece.sourceAtStart),
  };
  if ("rate" in piece) {
    return {
      ...common,
      kind: "affine",
      rate: piece.rate.numerator / piece.rate.denominator,
      ...(piece.wrap === undefined ? {} : {
        wrap: { start: exactNumber(piece.wrap.start), end: exactNumber(piece.wrap.end) },
      }),
    };
  }
  return {
    ...common,
    kind: "cubic",
    sourceControl1: exactNumber(piece.sourceControl1),
    sourceControl2: exactNumber(piece.sourceControl2),
    sourceAtEnd: exactNumber(piece.sourceAtEnd),
  };
}

function numericMap(map: TemporalMap): NumericMap {
  return { stages: map.stages.map((stage) => ({ sourceDuration: exactNumber(stage.source.duration), pieces: stage.pieces.map(numericPiece) })) };
}

function pieceAt(stage: NumericStage, target: number, direction: -1 | 0 | 1): NumericPiece | undefined {
  let low = 0;
  let high = stage.pieces.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (direction < 0 ? stage.pieces[middle]!.targetStart < target : stage.pieces[middle]!.targetStart <= target) low = middle + 1;
    else high = middle;
  }
  const piece = stage.pieces[low - 1];
  if (piece === undefined || target < piece.targetStart) return undefined;
  return temporalSampleContains(target - piece.targetStart, target - piece.targetEnd, direction) ? piece : undefined;
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function evaluateStage(piece: NumericPiece, target: number, incoming: -1 | 0 | 1): { readonly source: number; readonly direction: -1 | 0 | 1 } {
  if (piece.kind === "affine") {
    let source = piece.sourceAtStart + (target - piece.targetStart) * piece.rate;
    if (piece.wrap !== undefined) {
      const length = piece.wrap.end - piece.wrap.start;
      const wrapped = modulo(source - piece.wrap.start, length);
      source = piece.wrap.start + wrapped;
      if ((piece.rate === 0 ? incoming : incoming * piece.rate) < 0 && Math.abs(wrapped) <= Number.EPSILON * Math.max(1, length) * 8) {
        source = piece.wrap.end;
      }
    }
    return { source, direction: Math.sign(piece.rate) as -1 | 0 | 1 };
  }
  const u = (target - piece.targetStart) / (piece.targetEnd - piece.targetStart);
  const v = 1 - u;
  const source = v * v * v * piece.sourceAtStart
    + 3 * v * v * u * piece.sourceControl1
    + 3 * v * u * u * piece.sourceControl2
    + u * u * u * piece.sourceAtEnd;
  return {
    source,
    direction: Math.sign(piece.sourceAtEnd - piece.sourceAtStart) as -1 | 0 | 1,
  };
}

function evaluateMap(map: NumericMap, target: number, direction: -1 | 0 | 1 = 1): { readonly source: number; readonly direction: -1 | 0 | 1 } | undefined {
  let source = target;
  for (const stage of map.stages) {
    const piece = pieceAt(stage, source, direction);
    if (piece === undefined) return undefined;
    const evaluated = evaluateStage(piece, source, direction);
    if (evaluated.direction !== 0) direction = Math.sign(direction * evaluated.direction) as -1 | 0 | 1;
    source = evaluated.source;
    if (!temporalSampleContains(source, source - stage.sourceDuration, direction)) return undefined;
  }
  return { source, direction };
}

function positiveAffineSpan(map: NumericMap, start: number, end: number, label: string): {
  readonly start: number;
  readonly end: number;
  readonly rate: number;
} {
  let left = start;
  let right = end;
  let totalRate = 1;
  for (const [index, stage] of map.stages.entries()) {
    const piece = stage.pieces.find((candidate) => candidate.targetStart <= left
      && candidate.targetEnd >= right);
    assert(piece !== undefined,
      `${label} stage ${index} crosses a gap or piece boundary unsupported by pitch-preserving reconstruction`);
    assert(piece.kind === "affine" && piece.wrap === undefined && piece.rate > 0,
      `${label} stage ${index} must be one positive affine, non-looping relation for pitch-preserving reconstruction`);
    left = piece.sourceAtStart + (left - piece.targetStart) * piece.rate;
    right = piece.sourceAtStart + (right - piece.targetStart) * piece.rate;
    totalRate *= piece.rate;
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
  const targetSeconds = exactNumber(clip.sampling.stages[0]!.target.duration);
  const sampled = positiveAffineSpan(numericMap(clip.sampling), 0, targetSeconds,
    `Audio Clip ${clip.id} sampling`);
  const prepared = positiveAffineSpan(numericMap(clip.preparation), sampled.start, sampled.end,
    `Audio Clip ${clip.id} preparation`);
  const sourceStartSample = Math.round(prepared.start * SAMPLE_RATE);
  const sourceEndSampleExclusive = Math.round(prepared.end * SAMPLE_RATE);
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

  sample(position: number, channel: 0 | 1, direction: -1 | 0 | 1): number {
    const { left, right, fraction } = samplePositions(position, this.sampleFrames, direction);
    const a = this.#sample(left, channel);
    if (fraction === 0 || right === left) return a;
    return a + (this.#sample(right, channel) - a) * fraction;
  }
}

type CompiledClip = {
  readonly clip: AudioProgramClip;
  readonly routeGain: number;
  readonly sampling: NumericMap;
  readonly preparation: NumericMap;
};

type CompositionNode = Extract<AudioProgramNode, { readonly kind: "composition" }>;
type CompiledComposition = {
  readonly node: CompositionNode;
  readonly routeGain: number;
  readonly sampling: NumericMap;
  readonly source: ProgramSignalReader;
};

type SignalRoute =
  | { readonly kind: "source"; readonly clip: AudioProgramClip; readonly gain: number }
  | { readonly kind: "composition"; readonly node: CompositionNode; readonly gain: number };

function signalRoutes(program: AudioProgram): SignalRoute[] {
  const nodes = new Map(program.graph.nodes.map((node) => [node.id, node] as const));
  const visit = (id: string, gain: number): SignalRoute[] => {
    const node = nodes.get(id)!;
    if (node.kind === "silence") return [];
    if (node.kind === "source") return [{ kind: "source", clip: node.clip, gain }];
    if (node.kind === "composition") return [{ kind: "composition", node, gain }];
    if (node.kind === "mix") return node.inputs.flatMap((input) => visit(input.node, gain));
    assert(Object.keys(node.inputs).every((port) => port === "signal"),
      `Audio Process ${node.id} has unsupported ports`);
    return visit(node.inputs.signal!.node, gain * readAudioGainProcess(node.program));
  };
  return visit(program.graph.output.node, 1);
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

type SamplePlan =
  | { readonly kind: "source"; readonly clip: AudioProgramClip; readonly position: number;
      readonly direction: -1 | 0 | 1; readonly reconstructed: boolean }
  | { readonly kind: "mix"; readonly inputs: readonly { readonly plan: SamplePlan; readonly gain: number }[] };

type BlockDemand = {
  readonly clips: Set<AudioProgramClip>;
  readonly samples: Map<ProgramSignalReader, Map<number, SamplePlan>>;
};

function samplePositions(position: number, sampleFrames: number, direction: -1 | 0 | 1) {
  assert(Number.isFinite(position), "Audio renderer sample position is not finite");
  const rounded = Math.round(position);
  if (direction < 0 && rounded > 0 && Math.abs(position - rounded) <= 1e-9) position = rounded - 1;
  assert(position >= 0 && position < sampleFrames, "Audio renderer sample position lies outside its decoded signal");
  const left = Math.floor(position);
  const right = Math.min(sampleFrames - 1, left + 1);
  return { left, right, fraction: position - left };
}

/** Compile only signal structure; each output block supplies its exact sample demands. */
class ProgramSignalReader {
  readonly sampleFrames: number;
  readonly #clips: readonly CompiledClip[];
  readonly #compositions: readonly CompiledComposition[];

  constructor(program: AudioProgram, cache: WeakMap<AudioProgram, ProgramSignalReader>) {
    this.sampleFrames = program.sampleFrames;
    cache.set(program, this);
    const routes = signalRoutes(program);
    this.#clips = routes
      .filter((route): route is Extract<SignalRoute, { kind: "source" }> => route.kind === "source")
      .map(({ clip, gain }) => ({ clip, routeGain: gain,
        sampling: numericMap(clip.sampling), preparation: numericMap(clip.preparation) }));
    this.#compositions = routes
      .filter((route): route is Extract<SignalRoute, { kind: "composition" }> => route.kind === "composition")
      .map(({ node, gain }) => {
        assert(node.reconstruction === undefined,
          `Audio Composition ${node.id} reconstruction is not supported by this renderer.`);
        return { node, routeGain: gain, sampling: numericMap(node.sampling),
          source: cache.get(node.program) ?? new ProgramSignalReader(node.program, cache) };
      });
  }

  #plan(frame: number, demand: BlockDemand): SamplePlan {
    let samples = demand.samples.get(this);
    if (samples === undefined) { samples = new Map(); demand.samples.set(this, samples); }
    const cached = samples.get(frame);
    if (cached !== undefined) return cached;
    const inputs: { plan: SamplePlan; gain: number }[] = [];
    for (const entry of this.#clips) {
      const clip = entry.clip;
      if (frame < clip.targetStartSample || frame >= clip.targetEndSampleExclusive) continue;
      const gain = levelAt(clip, frame) * entry.routeGain;
      if (gain === 0) continue;
      let position: number;
      let direction: -1 | 0 | 1;
      const reconstructed = clip.reconstruction !== undefined;
      if (reconstructed) { position = frame - clip.targetStartSample; direction = 1; }
      else {
        const prepared = evaluateMap(entry.sampling, (frame - clip.targetStartSample) / SAMPLE_RATE);
        if (prepared === undefined) continue;
        const source = evaluateMap(entry.preparation, prepared.source, prepared.direction);
        if (source === undefined) continue;
        position = source.source * SAMPLE_RATE;
        direction = source.direction;
      }
      demand.clips.add(clip);
      inputs.push({ gain, plan: { kind: "source", clip, position, direction, reconstructed } });
    }
    for (const entry of this.#compositions) {
      const node = entry.node;
      if (frame < node.targetStartSample || frame >= node.targetEndSampleExclusive) continue;
      let gain = node.gain * entry.routeGain;
      if (node.fadeInSamples > 0 && frame < node.targetStartSample + node.fadeInSamples)
        gain *= Math.max(0, (frame - node.targetStartSample) / node.fadeInSamples);
      if (node.fadeOutSamples > 0 && frame >= node.targetEndSampleExclusive - node.fadeOutSamples)
        gain *= Math.max(0, (node.targetEndSampleExclusive - frame) / node.fadeOutSamples);
      if (gain === 0) continue;
      const mapped = evaluateMap(entry.sampling, (frame - node.targetStartSample) / SAMPLE_RATE);
      if (mapped === undefined) continue;
      inputs.push({ gain, plan: entry.source.plan(mapped.source * SAMPLE_RATE, mapped.direction, demand) });
    }
    const plan: SamplePlan = { kind: "mix", inputs };
    samples.set(frame, plan);
    return plan;
  }

  plan(position: number, direction: -1 | 0 | 1, demand: BlockDemand): SamplePlan {
    if (this.sampleFrames === 0) return { kind: "mix", inputs: [] };
    const { left, right, fraction } = samplePositions(position, this.sampleFrames, direction);
    const first = this.#plan(left, demand);
    if (fraction === 0 || right === left) return first;
    return { kind: "mix", inputs: [
      { plan: first, gain: 1 - fraction }, { plan: this.#plan(right, demand), gain: fraction },
    ] };
  }
}

function readPlannedSample(
  plan: SamplePlan,
  sourceForClip: (clip: AudioProgramClip) => CanonicalPcmReader,
  reconstructedForClip: ((clip: AudioProgramClip) => CanonicalPcmReader | undefined) | undefined,
  cache: Map<SamplePlan, readonly [number, number]>,
): readonly [number, number] {
  const existing = cache.get(plan);
  if (existing !== undefined) return existing;
  let result: [number, number];
  if (plan.kind === "source") {
    const reader = plan.reconstructed ? reconstructedForClip?.(plan.clip) : sourceForClip(plan.clip);
    assert(reader !== undefined, `Audio renderer Clip ${plan.clip.id} has no prepared source`);
    result = [reader.sample(plan.position, 0, plan.direction), reader.sample(plan.position, 1, plan.direction)];
  } else {
    result = [0, 0];
    for (const input of plan.inputs) {
      const sample = readPlannedSample(input.plan, sourceForClip, reconstructedForClip, cache);
      result[0] += sample[0] * input.gain;
      result[1] += sample[1] * input.gain;
    }
  }
  cache.set(plan, result);
  return result;
}

/**
 * Evaluate one renderer-facing AudioProgram as a signal pullback. TemporalMap
 * chooses source position; pitch-preserving reconstruction is a separate,
 * explicit Clip programme and is never inferred here.
 */
export async function renderAudioProgramWav(options: {
  readonly path: string;
  readonly program: AudioProgram;
  readonly startSample: number;
  readonly sampleFrames: number;
  readonly prepareClips?: (clips: ReadonlySet<AudioProgramClip>) => Promise<void>;
  readonly sourceForClip: (clip: AudioProgramClip) => CanonicalPcmReader;
  readonly reconstructedForClip?: (clip: AudioProgramClip) => CanonicalPcmReader | undefined;
}): Promise<void> {
  assert(options.startSample >= 0 && options.sampleFrames >= 0
    && options.startSample + options.sampleFrames <= options.program.sampleFrames,
  "Audio renderer range lies outside its programme");
  const reader = new ProgramSignalReader(options.program, new WeakMap());
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    output = await open(options.path, "w");
    await output.write(wavHeader(options.sampleFrames));
    for (let blockStart = 0; blockStart < options.sampleFrames; blockStart += OUTPUT_BLOCK_FRAMES) {
      const frames = Math.min(OUTPUT_BLOCK_FRAMES, options.sampleFrames - blockStart);
      const absoluteStart = options.startSample + blockStart;
      const demand: BlockDemand = { clips: new Set(), samples: new Map() };
      const plans = Array.from({ length: frames }, (_, frame) => reader.plan(absoluteStart + frame, 1, demand));
      await options.prepareClips?.(demand.clips);
      const values = new Map<SamplePlan, readonly [number, number]>();
      const bytes = Buffer.allocUnsafe(frames * BYTES_PER_FRAME);
      for (let frame = 0; frame < frames; frame += 1) {
        const sample = readPlannedSample(plans[frame]!, options.sourceForClip, options.reconstructedForClip, values);
        for (const channel of [0, 1] as const) bytes.writeInt16LE(pcm16(sample[channel]),
          (frame * CHANNELS + channel) * BYTES_PER_SAMPLE);
      }
      await output.write(bytes);
    }
  } finally {
    await output?.close();
  }
}
