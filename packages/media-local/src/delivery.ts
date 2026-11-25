import { spawn } from "node:child_process";
import { once } from "node:events";
import { stat } from "node:fs/promises";
import { assertAudioProgram, type AudioProgram, type RenderedAudio } from "@hypit/audio-program";
import type { RenderedVisual } from "@hypit/html-program";
import { isWaveformPreviewResolution, type MediaAudioPeaks } from "@hypit/media";
import {
  addExactTemporalValues, compareExactTemporalValues, composeTemporalMaps, exactTemporalZero,
  extrapolateTemporalAffineMapPiece, type ExactTemporalValue, type TemporalMap, type TemporalRange,
} from "@hypit/temporal/algebra";
import { audioTempo, audioTimeSegments } from "./audio-time.js";
import { pcmSampleIndex } from "./pcm-clock.js";
import { runBoundedMediaProcess } from "./process.js";
import { resolveLocalMediaToolchain, type LocalMediaToolchainOptions } from "./toolchain.js";
import { peakWaveformFilter, readWaveformPeaks } from "./waveform.js";

const seconds = (value: ExactTemporalValue): number => Number(BigInt(value.ticks))
  * value.timeBase.numerator / value.timeBase.denominator;
function controlExpression(map: TemporalMap, subject: string): string {
  const domain = map.stages[0]?.target;
  if (domain === undefined) throw new Error(`${subject} has no target clock.`);
  const pieces = audioTimeSegments(map, { start: exactTemporalZero(), end: domain.duration }, subject);
  const last = pieces.at(-1);
  if (last === undefined) throw new Error(`${subject} has no mapped control time.`);
  const branch = (time: ExactTemporalValue, before: string, after: string) =>
    `if(lt(t\\,${seconds(time)})\\,${before}\\,${after})`;
  let expression = String(seconds(extrapolateTemporalAffineMapPiece(last, last.target.end)));
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index]!;
    const start = seconds(piece.target.start);
    const source = seconds(piece.sourceAtStart);
    const rate = piece.rate.numerator / piece.rate.denominator;
    expression = branch(piece.target.end, `((${rate})*(t-(${start}))+(${source}))`, expression);
    const previous = pieces[index - 1];
    if (previous === undefined || compareExactTemporalValues(previous.target.end, piece.target.start) < 0) {
      const held = previous === undefined ? source : seconds(extrapolateTemporalAffineMapPiece(previous, previous.target.end));
      expression = branch(piece.target.start, String(held), expression);
    }
  }
  return expression;
}

function audioGraph(program: AudioProgram, start: number, end: number): {
  readonly inputArguments: readonly string[]; readonly filter: string; readonly output: string;
} {
  const inputArguments: string[] = [];
  const filters: string[] = [];
  const compiled = new Map<string, string[]>();
  const uses = new Map<string, number>();
  let serial = 0;
  const label = (prefix: string): string => `${prefix}${serial++}`;
  const rate = program.sampleRate;
  const layout = program.channels === 1 ? "mono" : "stereo";
  const format = `aformat=sample_fmts=flt:sample_rates=${rate}:channel_layouts=${layout}`;
  const duration = pcmSampleIndex(program.domain.duration, rate);

  function countUses(id: string): void {
    const count = uses.get(id) ?? 0;
    uses.set(id, count + 1);
    if (count > 0) return;
    const node = program.nodes[id];
    if (node === undefined) throw new Error(`Audio Program references missing node ${id}.`);
    if (node.kind === "restrict") countUses(node.input);
    if (node.kind === "mix") node.inputs.forEach(countUses);
    if (node.kind === "process") Object.values(node.inputs).forEach(countUses);
  }

  const silence = () => {
    const output = label("silence");
    filters.push(`anullsrc=r=${rate}:cl=${layout},atrim=end_sample=${duration},${format}[${output}]`);
    return output;
  };
  const mix = (inputs: readonly string[]): string => {
    if (inputs.length === 0) return silence();
    if (inputs.length === 1) return inputs[0]!;
    const output = label("mix");
    filters.push(`${inputs.map(input => `[${input}]`).join("")}amix=inputs=${inputs.length}:duration=longest:normalize=0[${output}]`);
    return output;
  };

  const split = (input: string, count: number): string[] => {
    if (count === 1) return [input];
    const outputs = Array.from({ length: count }, () => label("branch"));
    filters.push(`[${input}]asplit=${count}${outputs.map(output => `[${output}]`).join("")}`);
    return outputs;
  };

  const delayed = (sample: number): string[] => sample === 0 ? [] : [`adelay=${sample}S:all=1`];

  function compile(id: string): string {
    const available = compiled.get(id);
    if (available !== undefined) {
      const output = available.shift();
      if (output === undefined) throw new Error(`Audio Program repeats an unallocated use of ${id}.`);
      return output;
    }
    const node = program.nodes[id]!;
    let output: string;
    if (node.kind === "silence") {
      output = silence();
    } else if (node.kind === "media") {
      const subject = `Audio media node ${id}`;
      const audio = node.media.interpretation.audio;
      if (audio === undefined) throw new Error(`${subject} has no selected Audio stream.`);
      const selected = node.mapping.stages.at(-1)?.source;
      const [member, ...rest] = audio.map.stages;
      if (selected === undefined || member === undefined) throw new Error(`${subject} has no readable source clock.`);
      // Each occurrence names its own copy of the accepted Media clock.
      const map = composeTemporalMaps(node.mapping, {
        stages: [{ ...member, target: { ...member.target, id: selected.id } }, ...rest],
      });
      const segments = audioTimeSegments(map, node.targetRange, subject).flatMap(segment => {
        if (segment.rate.numerator <= 0) throw new Error(`${subject} requires positive source rates.`);
        const first = pcmSampleIndex(addExactTemporalValues(node.targetStart, segment.target.start), rate);
        const last = pcmSampleIndex(addExactTemporalValues(node.targetStart, segment.target.end), rate);
        if (last <= first) return [];
        const sourceStart = pcmSampleIndex(segment.sourceAtStart, rate);
        const sourceEnd = pcmSampleIndex(extrapolateTemporalAffineMapPiece(segment, segment.target.end), rate);
        return [{ first, length: last - first, sourceStart, sourceEnd, tempo: segment.rate }];
      });
      if (segments.length === 0) output = silence();
      else {
        const index = inputArguments.length / 2;
        inputArguments.push("-i", node.media.resource.address);
        const normalized = label("source");
        filters.push(`[${index}:${audio.streamIndex}]asetpts=PTS-STARTPTS,aresample=${rate}:first_pts=0,${format}[${normalized}]`);
        const inputs = split(normalized, segments.length);
        output = mix(segments.map(({ first, length, sourceStart, sourceEnd, tempo }, index) => {
          const result = label("media");
          const chain = [
            `atrim=start_sample=${sourceStart}:end_sample=${Math.max(sourceStart + 1, sourceEnd)}`, "asetpts=PTS-STARTPTS",
            ...audioTempo(tempo.numerator, tempo.denominator), `apad=whole_len=${length}`, `atrim=end_sample=${length}`,
            "asetpts=N/SR/TB", ...delayed(first),
          ];
          filters.push(`[${inputs[index]}]${chain.join(",")}[${result}]`);
          return result;
        }));
      }
    } else if (node.kind === "restrict") {
      const input = compile(node.input);
      const first = pcmSampleIndex(node.range.start, rate);
      const last = pcmSampleIndex(node.range.end, rate);
      output = label("restrict");
      const chain = [
        `apad=whole_len=${last}`, `atrim=start_sample=${first}:end_sample=${last}`, "asetpts=N/SR/TB", ...delayed(first),
      ];
      filters.push(`[${input}]${chain.join(",")}[${output}]`);
    } else if (node.kind === "mix") {
      output = mix(node.inputs.map(compile));
    } else {
      output = label("process");
      let filter = node.program.filter.replaceAll("{{output}}", `[${output}]`);
      for (const [name, input] of Object.entries(node.inputs)) filter = filter.replaceAll(`{{input:${name}}}`, `[${compile(input)}]`);
      for (const [name, map] of Object.entries(node.program.controls)) {
        filter = filter.replaceAll(`{{control:${name}}}`, controlExpression(map, `Audio process ${id} control ${name}`));
      }
      if (/\{\{(?:input|control|output):?/u.test(filter)) throw new Error(`Audio process ${id} left unresolved placeholders.`);
      filters.push(filter);
    }
    const outputs = split(output, uses.get(id)!);
    const first = outputs.shift()!;
    compiled.set(id, outputs);
    return first;
  }

  countUses(program.root);
  const root = compile(program.root);
  filters.push(`[${root}]aresample=${rate}:first_pts=0,apad,atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS[audioOut]`);
  return { inputArguments, filter: filters.join(";"), output: "audioOut" };
}

async function run(executable: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const process = spawn(executable, [...args], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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

function audioInterval(program: AudioProgram, range?: TemporalRange) {
  assertAudioProgram(program);
  const zero = exactTemporalZero();
  const duration = program.domain.duration;
  const { start, end } = range ?? { start: zero, end: duration };
  if (compareExactTemporalValues(start, zero) < 0 || compareExactTemporalValues(end, duration) > 0
    || compareExactTemporalValues(start, end) >= 0) throw new Error("Audio render range is outside the Programme.");
  const first = pcmSampleIndex(start, program.sampleRate);
  const last = pcmSampleIndex(end, program.sampleRate);
  if (first >= last) throw new Error("Audio render interval has no samples.");
  return { first, last };
}

export async function renderAudioProgramLocally(input: {
  readonly program: AudioProgram;
  readonly destination: string;
  readonly ffmpegPath?: string;
  readonly signal?: AbortSignal;
  readonly range?: TemporalRange;
}): Promise<RenderedAudio> {
  const { first, last } = audioInterval(input.program, input.range);
  const graph = audioGraph(input.program, first, last);
  await run(input.ffmpegPath ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    ...graph.inputArguments, "-filter_complex", graph.filter, "-map", `[${graph.output}]`,
    "-c:a", "pcm_s16le", "-ar", String(input.program.sampleRate), "-ac", String(input.program.channels), input.destination], input.signal);
  const information = await stat(input.destination);
  return { resource: { address: input.destination, mediaType: "audio/wav", size: information.size },
    sampleRate: input.program.sampleRate, channels: input.program.channels,
    sampleFrames: last - first };
}

/** Prepare a bounded Wave buffer on the same sample grid as delivery. */
export async function renderAudioProgramBufferLocally(input: {
  readonly program: AudioProgram;
  readonly range: TemporalRange;
  readonly tools: LocalMediaToolchainOptions;
  readonly signal: AbortSignal;
}): Promise<Uint8Array> {
  const { program, range, tools, signal } = input;
  const { first, last } = audioInterval(program, range);
  if (last - first > 10 * program.sampleRate) throw new Error("Audio buffer range exceeds ten seconds.");
  const graph = audioGraph(program, first, last);
  const { ffmpegPath } = resolveLocalMediaToolchain(tools);
  return await runBoundedMediaProcess({
    executable: ffmpegPath,
    argv: ["-hide_banner", "-loglevel", "error", "-nostdin", ...graph.inputArguments,
      "-filter_complex", graph.filter, "-map", `[${graph.output}]`,
      "-c:a", "pcm_s16le", "-ar", String(program.sampleRate), "-ac", String(program.channels), "-f", "wav", "pipe:1"],
    timeoutMs: 15_000, maxStdoutBytes: (last - first) * program.channels * 2 + 4096, signal,
  });
}

/** Measure the same mix and sample clock used by playback and delivery. */
export async function readAudioProgramWaveformPeaksLocally(input: {
  readonly program: AudioProgram;
  readonly range: TemporalRange;
  readonly samplesPerPeak: number;
  readonly tools: LocalMediaToolchainOptions;
  readonly signal: AbortSignal;
}): Promise<MediaAudioPeaks> {
  const { program, range, samplesPerPeak, tools, signal } = input;
  if (!isWaveformPreviewResolution(samplesPerPeak)) throw new Error("Programme waveform requires a supported PCM resolution.");
  const { first, last } = audioInterval(program, range);
  const graph = audioGraph(program, first, last);
  return await readWaveformPeaks({
    executable: resolveLocalMediaToolchain(tools).ffmpegPath, signal,
    sampleRate: program.sampleRate, sampleCount: last - first, samplesPerPeak,
    argumentsForFilter: envelope => ["-hide_banner", "-loglevel", "error", "-nostdin", ...graph.inputArguments,
      "-filter_complex", `${graph.filter};[${graph.output}]${envelope}[peaks]`, "-map", "[peaks]", "-f", "null", "-"],
  });
}

/** Sample the same bounded mix and Programme clock as audio delivery, then derive peak pixels. */
export async function renderAudioProgramWaveformLocally(input: {
  readonly program: AudioProgram;
  readonly range: TemporalRange;
  readonly width: number;
  readonly height: number;
  readonly tools?: LocalMediaToolchainOptions;
  readonly signal?: AbortSignal;
}): Promise<Uint8Array> {
  const { first, last } = audioInterval(input.program, input.range);
  if (last - first > 120 * input.program.sampleRate) throw new Error("Programme waveform range exceeds 120 seconds.");
  const graph = audioGraph(input.program, first, last);
  const waveform = peakWaveformFilter(input.width, input.height);
  const { ffmpegPath } = resolveLocalMediaToolchain(input.tools);
  const bytes = await runBoundedMediaProcess({
    executable: ffmpegPath,
    argv: ["-hide_banner", "-loglevel", "error", "-nostdin", ...graph.inputArguments,
      "-filter_complex", `${graph.filter};[${graph.output}]${waveform}[peaks]`, "-map", "[peaks]",
      "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"],
    timeoutMs: 90_000, maxStdoutBytes: 8 * 1024 * 1024,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (bytes.byteLength === 0) throw new Error("Programme waveform produced no image.");
  return bytes;
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
