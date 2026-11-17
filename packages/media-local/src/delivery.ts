import { spawn } from "node:child_process";
import { once } from "node:events";
import { stat } from "node:fs/promises";
import { assertAudioProgram, type AudioProgram, type RenderedAudio } from "@hypit/audio-program";
import type { RenderedVisual } from "@hypit/html-program";
import {
  compareExactTemporalValues, exactTemporalZero,
  type ExactTemporalValue, type TemporalMap, type TemporalRange,
} from "@hypit/temporal/algebra";

const seconds = (value: ExactTemporalValue): number => Number(BigInt(value.ticks))
  * value.timeBase.numerator / value.timeBase.denominator;
const rangeDuration = (value: TemporalRange): number => seconds(value.end) - seconds(value.start);

function controlExpression(map: TemporalMap): string {
  if (map.stages.length !== 1 || map.stages[0]!.pieces.length !== 1) {
    throw new Error("Local Audio Control requires one linear map piece.");
  }
  const piece = map.stages[0]!.pieces[0]!;
  if (!("rate" in piece) || piece.wrap !== undefined) throw new Error("Local Audio Control requires an unwrapped linear map piece.");
  const start = seconds(piece.target.start);
  const source = seconds(piece.sourceAtStart);
  const rate = piece.rate.numerator / piece.rate.denominator;
  return `((${rate})*(t-(${start}))+(${source}))`;
}

function audioGraph(program: AudioProgram, start: number, end: number): {
  readonly inputArguments: readonly string[]; readonly filter: string; readonly output: string;
} {
  const inputArguments: string[] = [];
  const filters: string[] = [];
  const compiled = new Map<string, string>();
  let serial = 0;
  const label = (prefix: string): string => `${prefix}${serial++}`;
  const duration = seconds(program.domain.duration);
  const compile = (id: string): string => {
    const cached = compiled.get(id);
    if (cached !== undefined) return cached;
    const node = program.nodes[id];
    if (node === undefined) throw new Error(`Audio Program references missing node ${id}.`);
    let output: string;
    if (node.kind === "silence") {
      output = label("silence");
      filters.push(`anullsrc=r=${program.sampleRate}:cl=${program.channels === 1 ? "mono" : "stereo"}:d=${duration}[${output}]`);
    } else if (node.kind === "media") {
      const piece = node.mapping.stages.length === 1 && node.mapping.stages[0]!.pieces.length === 1
        ? node.mapping.stages[0]!.pieces[0]! : undefined;
      if (piece === undefined || !("rate" in piece) || piece.wrap !== undefined
        || piece.rate.numerator !== piece.rate.denominator) {
        throw new Error(`Audio media node ${id} requires one unwrapped unit-rate map.`);
      }
      const stream = node.media.interpretation.audio?.streamIndex;
      if (stream === undefined) throw new Error(`Audio media node ${id} has no selected Audio stream.`);
      const input = inputArguments.length / 2;
      inputArguments.push("-i", node.media.resource.address);
      output = label("media");
      const delay = Math.round(seconds(node.targetStart) * 1000);
      filters.push(`[${input}:${stream}]atrim=start=${seconds(piece.sourceAtStart)}:duration=${rangeDuration(node.targetRange)},asetpts=PTS-STARTPTS,adelay=${delay}:all=1[${output}]`);
    } else if (node.kind === "restrict") {
      output = label("restrict");
      filters.push(`[${compile(node.input)}]atrim=start=${seconds(node.range.start)}:end=${seconds(node.range.end)}[${output}]`);
    } else if (node.kind === "mix") {
      const inputs = node.inputs.map(compile);
      output = label("mix");
      if (inputs.length === 1) filters.push(`[${inputs[0]}]anull[${output}]`);
      else filters.push(`${inputs.map(input => `[${input}]`).join("")}amix=inputs=${inputs.length}:duration=longest:normalize=0[${output}]`);
    } else {
      output = label("process");
      let filter = node.program.filter.replaceAll("{{output}}", `[${output}]`);
      for (const [name, input] of Object.entries(node.inputs)) filter = filter.replaceAll(`{{input:${name}}}`, `[${compile(input)}]`);
      for (const [name, map] of Object.entries(node.program.controls)) filter = filter.replaceAll(`{{control:${name}}}`, controlExpression(map));
      if (/\{\{(?:input|control|output):?/u.test(filter)) throw new Error(`Audio process ${id} left unresolved placeholders.`);
      filters.push(filter);
    }
    compiled.set(id, output);
    return output;
  };
  const root = compile(program.root);
  filters.push(`[${root}]aresample=${program.sampleRate}:first_pts=0,apad,atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS[audioOut]`);
  return { inputArguments, filter: filters.join(";"), output: "audioOut" };
}

async function run(executable: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const process = spawn(executable, [...args], { stdio: ["ignore", "ignore", "pipe"] });
  let diagnostic = "";
  process.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString("utf8"); });
  const abort = () => process.kill("SIGTERM");
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [code] = await once(process, "exit") as [number | null];
    signal?.throwIfAborted();
    if (code !== 0) throw new Error(`FFmpeg failed (${code ?? "signal"}): ${diagnostic.trim()}`);
  } finally { signal?.removeEventListener("abort", abort); }
}

export async function renderAudioProgramLocally(input: {
  readonly program: AudioProgram;
  readonly destination: string;
  readonly ffmpegPath?: string;
  readonly signal?: AbortSignal;
  readonly range?: TemporalRange;
}): Promise<RenderedAudio> {
  assertAudioProgram(input.program);
  const zero = exactTemporalZero();
  const duration = input.program.domain.duration;
  const { start, end } = input.range ?? { start: zero, end: duration };
  if (compareExactTemporalValues(start, zero) < 0 || compareExactTemporalValues(end, duration) > 0
    || compareExactTemporalValues(start, end) >= 0) throw new Error("Audio render range is outside the Programme.");
  const sample = (value: ExactTemporalValue) => {
    const numerator = BigInt(value.ticks) * BigInt(value.timeBase.numerator) * BigInt(input.program.sampleRate);
    const denominator = BigInt(value.timeBase.denominator);
    const index = Number((2n * numerator + denominator) / (2n * denominator));
    if (!Number.isSafeInteger(index)) throw new Error("Audio render sample exceeds the supported range.");
    return index;
  };
  const first = sample(start);
  const last = sample(end);
  if (first >= last) throw new Error("Audio render interval has no samples.");
  const graph = audioGraph(input.program, first, last);
  await run(input.ffmpegPath ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    ...graph.inputArguments, "-filter_complex", graph.filter, "-map", `[${graph.output}]`,
    "-c:a", "pcm_s16le", "-ar", String(input.program.sampleRate), "-ac", String(input.program.channels), input.destination], input.signal);
  const information = await stat(input.destination);
  return { resource: { address: input.destination, mediaType: "audio/wav", size: information.size },
    sampleRate: input.program.sampleRate, channels: input.program.channels,
    sampleFrames: last - first };
}

export async function muxLocalVideo(input: {
  readonly visual: RenderedVisual;
  readonly audio?: RenderedAudio;
  readonly destination: string;
  readonly ffmpegPath?: string;
  readonly signal?: AbortSignal;
}): Promise<import("@hypit/media").MediaResource> {
  await run(input.ffmpegPath ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input.visual.resource.address,
    ...(input.audio === undefined ? [] : ["-i", input.audio.resource.address]), "-map", "0:v:0",
    ...(input.audio === undefined ? ["-an"] : ["-map", "1:a:0", "-c:a", "aac"]),
    "-c:v", "copy", "-movflags", "+faststart", input.destination], input.signal);
  const information = await stat(input.destination);
  return { address: input.destination, mediaType: "video/mp4", size: information.size };
}
