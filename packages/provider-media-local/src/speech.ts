import { open } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPreparedAudioSource } from "@hypit/media";
import type { MediaAudioStream } from "@hypit/media";
import { inspectMediaFile } from "@hypit/media-local";
import type { MediaExecutionEnvironment, MediaOperationResult } from "@hypit/media-local/execution";
import { runBoundedMediaProcess } from "@hypit/media-local/process";
import {
  assertSpeechEvidenceAudioIdentity,
  sealSpeechEvidenceAudio,
  speechEvidenceSampleFrames,
} from "@hypit/speech-evidence";
import type { ProjectSpeechEvidenceAudioNeed, SpeechEvidenceAudio } from "@hypit/speech-evidence";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";
import {
  addExactTemporalValues,
  assertTemporalMap,
  isAffineTemporalMapPiece,
  resolveTemporalBoundary,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMapStage } from "@hypit/temporal";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function evidenceAudioNeed(value: CanonicalValue): ProjectSpeechEvidenceAudioNeed {
  const item = value as unknown as ProjectSpeechEvidenceAudioNeed;
  verifyPreparedAudioSource(item.source);
  assertTemporalMap(item.preparation);
  assert(item.preparation.stages.at(-1)!.source.id === item.source.sourceDomain.id,
    "Speech evidence preparation does not end at its selected audio source");
  speechEvidenceSampleFrames(item.preparation.stages[0]!.target);
  return item;
}

async function stageArtifact(
  env: MediaExecutionEnvironment,
  source: BlobRef,
  path: string,
): Promise<void> {
  env.signal?.throwIfAborted();
  const chunks = await env.artifacts.open(source);
  assert(chunks !== undefined, `Media source ${source.resource} is unavailable`);
  const file = await open(path, "w");
  let size = 0;
  try {
    for await (const chunk of chunks) {
      env.signal?.throwIfAborted();
      await file.write(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await file.close();
  }
  assert(size === source.size, `Media source ${source.resource} size differs`);
}

function atempo(rate: number): string[] {
  if (Math.abs(rate - 1) < 1e-12) return [];
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) >= 1e-12) filters.push(`atempo=${remaining.toPrecision(15)}`);
  return filters;
}

const speechClock = { frameRate: { numerator: 16_000, denominator: 1 } } as const;

function speechSampleBoundary(value: ExactTemporalValue): number {
  return resolveTemporalBoundary(value, speechClock, "nearest");
}

function speechStageFilter(
  stage: TemporalMapStage,
  input: string,
  index: number,
): { readonly filters: readonly string[]; readonly output: string } {
  const filters: string[] = [];
  const branches = stage.pieces.map((_, pieceIndex) => `speech-${index}-source-${pieceIndex}`);
  if (branches.length > 1) {
    filters.push(`[${input}]asplit=${branches.length}${branches.map((label) => `[${label}]`).join("")}`);
  }
  const segments: string[] = [];
  let cursor = 0;
  const silence = (sampleFrames: number): void => {
    if (sampleFrames < 1) return;
    const label = `speech-${index}-silence-${segments.length}`;
    filters.push(`anullsrc=r=16000:cl=mono,atrim=start_sample=0:end_sample=${sampleFrames},asetpts=N/SR/TB[${label}]`);
    segments.push(label);
  };
  for (const [pieceIndex, piece] of stage.pieces.entries()) {
    assert(isAffineTemporalMapPiece(piece),
      `Speech evidence audio map stage ${index} is outside this renderer's affine capability.`);
    assert(piece.wrap === undefined, `Speech evidence audio map stage ${index} cannot contain wrap.`);
    assert(piece.rate.numerator > 0, `Speech evidence audio map stage ${index} requires a positive rate.`);
    const targetStart = speechSampleBoundary(piece.target.start);
    const targetEnd = speechSampleBoundary(piece.target.end);
    silence(targetStart - cursor);
    const targetSamples = targetEnd - targetStart;
    if (targetSamples > 0) {
      const targetDuration = subtractExactTemporalValues(piece.target.end, piece.target.start);
      const sourceEnd = addExactTemporalValues(piece.sourceAtStart,
        scaleExactTemporalValue(targetDuration, piece.rate));
      const sourceStartSample = speechSampleBoundary(piece.sourceAtStart);
      const sourceEndSample = speechSampleBoundary(sourceEnd);
      const rate = piece.rate.numerator / piece.rate.denominator;
      const tempo = atempo(rate);
      const label = `speech-${index}-piece-${pieceIndex}`;
      const branch = branches.length > 1 ? branches[pieceIndex]! : input;
      filters.push(`[${branch}]atrim=start_sample=${sourceStartSample}:end_sample=${sourceEndSample},`
        + `asetpts=N/SR/TB,${tempo.join(",")}${tempo.length === 0 ? "" : ","}`
        + `apad=whole_len=${targetSamples},atrim=start_sample=0:end_sample=${targetSamples},`
        + `asetpts=N/SR/TB[${label}]`);
      segments.push(label);
    }
    cursor = targetEnd;
  }
  const stageSamples = speechEvidenceSampleFrames(stage.target);
  silence(stageSamples - cursor);
  const output = `speech-stage-${index}`;
  assert(segments.length > 0, `Speech evidence audio map stage ${index} has no representable signal.`);
  if (segments.length === 1) {
    filters.push(`[${segments[0]}]anull,apad=whole_len=${stageSamples},`
      + `atrim=start_sample=0:end_sample=${stageSamples},asetpts=N/SR/TB[${output}]`);
  } else {
    filters.push(`${segments.map((label) => `[${label}]`).join("")}concat=n=${segments.length}:v=0:a=1,`
      + `apad=whole_len=${stageSamples},atrim=start_sample=0:end_sample=${stageSamples},`
      + `asetpts=N/SR/TB[${output}]`);
  }
  return { filters, output };
}

/** Speech-specific adapter over the neutral local media execution environment. */
export async function executeProjectSpeechEvidenceAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = evidenceAudioNeed(constraints);
  const sampleFrames = speechEvidenceSampleFrames(need.preparation.stages[0]!.target);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-speech-evidence-"));
  try {
    const input = join(work, "source-media");
    const output = join(work, "speech-evidence.wav");
    await stageArtifact(env, need.source.source, input);
    const sourceSamples = speechEvidenceSampleFrames(need.source.sourceDomain);
    const filters: string[] = [
      `[0:${need.source.streamIndex}]aresample=16000:async=0:first_pts=0,`
      + `aformat=sample_rates=16000:channel_layouts=mono,asetpts=N/SR/TB,`
      + `apad=whole_len=${sourceSamples},atrim=start_sample=0:end_sample=${sourceSamples},`
      + "asetpts=N/SR/TB[speech-source]",
    ];
    let current = "speech-source";
    for (const [index, stage] of [...need.preparation.stages].reverse().entries()) {
      const rendered = speechStageFilter(stage, current, index);
      filters.push(...rendered.filters);
      current = rendered.output;
    }
    await runBoundedMediaProcess({
      executable: env.ffmpegPath,
      argv: ["-y", "-i", input, "-filter_complex", filters.join(";"), "-map", `[${current}]`,
        "-vn", "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", output],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      ...(env.signal === undefined ? {} : { signal: env.signal }),
    });
    const inspected = await inspectMediaFile(output, {
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      ...(env.signal === undefined ? {} : { signal: env.signal }),
    });
    const streams = inspected.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
    assert(streams.length === 1 && inspected.streams.length === 1
      && streams[0]!.codecName === "pcm_s16le"
      && streams[0]!.sampleRate === 16_000
      && streams[0]!.channels === 1
      && streams[0]!.decodedSampleFrames === sampleFrames,
    "Speech evidence must be exact 16 kHz mono PCM s16 on the Prepared Media domain");
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    const evidence: SpeechEvidenceAudio = sealSpeechEvidenceAudio({ artifact, sampleFrames });
    assertSpeechEvidenceAudioIdentity(evidence);
    return { value: canonicalize(evidence) };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
