import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpeechBasisSegment } from "@narratage/speech";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@narratage/speech-evidence";
import type { AlignedTranscriptEvidence, AlignedTranscriptSegment } from "@narratage/speech-evidence";
import type { EndpointInvocationContext, EndpointFulfillment } from "@narratage/endpoint-kit";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import {
  whisperXCapabilities,
} from "@narratage/whisperx";
import type { WhisperXAlignmentRequest } from "@narratage/whisperx";

export const localWhisperXProviderModuleRef = {
  name: "@narratage/provider-whisperx-local",
  version: "1",
} as const;
export const localWhisperXProviderImplementationDigest = digestOf(
  "@narratage/provider-whisperx-local/svml-service@1",
);
export const localWhisperXPunktTabDigest =
  "e57f64187974277726a3417ca6f181ec5403676c717672eef6a748a7b20e0106";

export type CreateLocalWhisperXProviderOptions = {
  readonly instance?: string;
  readonly authority?: string;
  /** Must resolve to the same machine because the protocol passes a staged local path. */
  readonly baseUrl?: string;
  readonly expectedModel?: string;
  readonly expectedDevice?: string;
  readonly expectedCompute?: string;
  readonly expectedBatchSize?: number;
  readonly expectedServiceVersion?: string;
  readonly expectedWhisperXVersion?: string;
  readonly expectedPunktTabDigest?: string;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
};

type RawWord = {
  readonly text?: unknown;
  readonly word?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly score?: unknown;
};

type RawSegment = {
  readonly start?: unknown;
  readonly end?: unknown;
  readonly words?: unknown;
};

export type WhisperXServiceResponse = {
  readonly language?: unknown;
  readonly segments?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function alignmentRequest(value: CanonicalValue): WhisperXAlignmentRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "WhisperX alignment request must be an object");
  const item = value as unknown as WhisperXAlignmentRequest;
  assert(item.contract === "svml.whisperx-alignment-request@1"
    && item.audio?.kind === "blob"
    && item.audio.mediaType === "audio/wav"
    && Number.isSafeInteger(item.sampleFrames)
    && item.sampleFrames > 0
    && item.segments.length > 0,
  "WhisperX alignment request is invalid");
  return item;
}

function fourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** Fail closed if the Provider would cause the service to normalize audio a second time. */
function assertCanonicalEvidenceWav(bytes: Uint8Array, sampleFrames: number): void {
  assert(bytes.byteLength >= 44 && fourCc(bytes, 0) === "RIFF" && fourCc(bytes, 8) === "WAVE",
    "WhisperX evidence Artifact is not a WAV file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: { readonly codec: number; readonly channels: number; readonly sampleRate: number; readonly bits: number }
    | undefined;
  let dataBytes: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const name = fourCc(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    assert(body + size <= bytes.byteLength, "WhisperX evidence WAV has a truncated chunk");
    if (name === "fmt ") {
      assert(size >= 16, "WhisperX evidence WAV fmt chunk is invalid");
      format = {
        codec: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (name === "data") {
      dataBytes = size;
    }
    offset = body + size + (size % 2);
  }
  assert(format?.codec === 1 && format.channels === 1 && format.sampleRate === 16_000 && format.bits === 16,
    "WhisperX evidence must be 16 kHz mono PCM s16 WAV");
  assert(dataBytes === sampleFrames * 2, "WhisperX evidence sample count differs from its contract");
}

function sourceSegmentFor(
  segments: readonly SpeechBasisSegment[],
  start: number | undefined,
  end: number | undefined,
  fallbackStart: number | undefined,
  fallbackEnd: number | undefined,
): SpeechBasisSegment {
  const point = start !== undefined && end !== undefined
    ? (start + end) / 2
    : fallbackStart !== undefined && fallbackEnd !== undefined ? (fallbackStart + fallbackEnd) / 2 : 0;
  return segments.find((segment, index) => point >= segment.startSec
    && (point < segment.endSec || index === segments.length - 1)) ?? segments[0]!;
}

/**
 * Lower service-specific pauses/segments onto authored structural Segments without inventing time.
 * A word crossing a structural cut keeps its lexical evidence but loses its per-word time; the
 * downstream locator may derive that uncertainty explicitly instead of receiving a clipped lie.
 */
export function interpretWhisperXResponse(
  response: WhisperXServiceResponse,
  sourceSegments: readonly SpeechBasisSegment[],
  durationSec: number,
): readonly AlignedTranscriptSegment[] {
  assert(sourceSegments.length > 0, "WhisperX request has no source Segment");
  assert(Array.isArray(response.segments), "WhisperX response has no Segment array");
  const buckets = new Map(sourceSegments.map((segment) => [segment.segmentId, [] as Array<{
    readonly text: string;
    readonly startSec?: number;
    readonly endSec?: number;
    readonly score?: number;
  }>]));
  const previousEnd = new Map(sourceSegments.map((segment) => [segment.segmentId, segment.startSec]));

  for (const rawSegmentValue of response.segments) {
    assert(rawSegmentValue !== null && typeof rawSegmentValue === "object" && !Array.isArray(rawSegmentValue),
      "WhisperX response Segment is invalid");
    const rawSegment = rawSegmentValue as RawSegment;
    const segmentStart = finite(rawSegment.start) ? rawSegment.start : undefined;
    const segmentEnd = finite(rawSegment.end) ? rawSegment.end : undefined;
    assert(Array.isArray(rawSegment.words), "WhisperX response Segment has no Word array");
    for (const rawWordValue of rawSegment.words) {
      assert(rawWordValue !== null && typeof rawWordValue === "object" && !Array.isArray(rawWordValue),
        "WhisperX response Word is invalid");
      const rawWord = rawWordValue as RawWord;
      const text = typeof rawWord.text === "string"
        ? rawWord.text.trim()
        : typeof rawWord.word === "string" ? rawWord.word.trim() : "";
      if (text.length === 0) continue;
      const start = finite(rawWord.start) ? rawWord.start : undefined;
      const end = finite(rawWord.end) ? rawWord.end : undefined;
      const source = sourceSegmentFor(sourceSegments, start, end, segmentStart, segmentEnd);
      const prior = previousEnd.get(source.segmentId)!;
      // A word whose timing cannot be proved keeps its text and loses its clock,
      // exactly as the service already does for words its aligner could not place.
      const timingIsProvable = start !== undefined && end !== undefined
        && start >= 0
        && end >= start
        && end <= durationSec + 1e-3
        && start >= source.startSec - 1e-6
        && end <= source.endSec + 1e-6
        && start >= prior - 1e-6;
      const score = finite(rawWord.score) && rawWord.score >= 0 && rawWord.score <= 1
        ? rawWord.score
        : undefined;
      buckets.get(source.segmentId)!.push({
        text,
        ...(timingIsProvable ? { startSec: start, endSec: end } : {}),
        ...(score === undefined ? {} : { score }),
      });
      if (timingIsProvable) previousEnd.set(source.segmentId, end);
    }
  }

  return sourceSegments.map((segment) => ({
    sourceSegmentId: segment.segmentId,
    words: buckets.get(segment.segmentId)!,
    chars: [],
  }));
}

async function limitedJson(response: Response, maxBytes: number, subject: string): Promise<{
  readonly value: unknown;
}> {
  const reader = response.body?.getReader();
  let bytes: Uint8Array;
  if (reader === undefined) {
    bytes = new Uint8Array(await response.arrayBuffer());
    assert(bytes.byteLength <= maxBytes, `${subject} exceeded the configured response limit`);
  } else {
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error(`${subject} exceeded the configured response limit`);
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  assert(response.ok, `${subject} failed with HTTP ${response.status}: ${Buffer.from(bytes).toString("utf8").slice(0, 500)}`);
  try {
    return { value: JSON.parse(Buffer.from(bytes).toString("utf8")) };
  } catch {
    throw new Error(`${subject} returned invalid JSON`);
  }
}

function result(value: CanonicalValue): EndpointFulfillment {
  return { value: { kind: "inline", value } };
}

export function createLocalWhisperXProvider(config: CreateLocalWhisperXProviderOptions) {
  const baseUrl = new URL(config.baseUrl ?? "http://127.0.0.1:8765");
  assert(baseUrl.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname),
    "local WhisperX Provider requires a loopback HTTP service");
  const normalizedBaseUrl = baseUrl.href.replace(/\/+$/u, "");
  const expectedModel = config.expectedModel ?? "small";
  const expectedDevice = config.expectedDevice ?? "cpu";
  const expectedCompute = config.expectedCompute ?? (expectedDevice === "cpu" ? "int8" : "float16");
  const expectedBatchSize = positiveInteger(config.expectedBatchSize ?? 8, "expectedBatchSize");
  const expectedServiceVersion = config.expectedServiceVersion ?? "0.1.0";
  const expectedWhisperXVersion = config.expectedWhisperXVersion ?? "3.8.6";
  const expectedPunktTabDigest = config.expectedPunktTabDigest ?? localWhisperXPunktTabDigest;
  assert(expectedModel.trim().length > 0, "expectedModel is empty");
  assert(expectedDevice.trim().length > 0, "expectedDevice is empty");
  assert(expectedCompute.trim().length > 0, "expectedCompute is empty");
  assert(expectedServiceVersion.trim().length > 0, "expectedServiceVersion is empty");
  assert(expectedWhisperXVersion.trim().length > 0, "expectedWhisperXVersion is empty");
  assert(/^[0-9a-f]{64}$/u.test(expectedPunktTabDigest), "expectedPunktTabDigest is invalid");
  const requestTimeoutMs = positiveInteger(config.requestTimeoutMs ?? 10 * 60_000, "requestTimeoutMs");
  const maxResponseBytes = positiveInteger(config.maxResponseBytes ?? 64 * 1024 * 1024, "maxResponseBytes");

  return defineEndpointPackage({
    module: localWhisperXProviderModuleRef,
    facet: "alignment",
    instance: config.instance ?? "whisperx.local",
    authority: config.authority ?? config.instance ?? "whisperx.local",
    implementation: {
      digest: localWhisperXProviderImplementationDigest,
    },
    configuration: canonicalize({
      baseUrl: normalizedBaseUrl,
      expectedModel,
      expectedDevice,
      expectedCompute,
      expectedBatchSize,
      expectedServiceVersion,
      expectedWhisperXVersion,
      expectedPunktTabDigest,
      requestTimeoutMs,
      maxResponseBytes,
    }),
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: whisperXCapabilities.alignment,
      returns: speechEvidenceTypes.alignedTranscript,
      supports: (need) => need.constraints !== null && typeof need.constraints === "object"
        && !Array.isArray(need.constraints)
        && (need.constraints as { readonly contract?: unknown }).contract === "svml.whisperx-alignment-request@1",
      handler: async (context: EndpointInvocationContext) => {
        const request = alignmentRequest(context.need.constraints);
        const audio = await context.artifacts.get(request.audio.digest);
        assert(audio !== undefined && audio.byteLength === request.audio.size,
          `WhisperX evidence Artifact ${request.audio.digest} is unavailable or has changed`);
        assertCanonicalEvidenceWav(audio, request.sampleFrames);
        const work = await mkdtemp(join(tmpdir(), "svml-whisperx-local-"));
        try {
          const audioPath = join(work, "alignment-evidence.wav");
          await writeFile(audioPath, audio);
          const signal = AbortSignal.timeout(requestTimeoutMs);
          const healthResponse = await fetch(`${normalizedBaseUrl}/health`, { signal });
          const health = await limitedJson(healthResponse, Math.min(maxResponseBytes, 64 * 1024), "WhisperX health");
          assert(health.value !== null && typeof health.value === "object" && !Array.isArray(health.value),
            "WhisperX health response is invalid");
          const healthValue = health.value as {
            readonly ok?: unknown;
            readonly protocol?: unknown;
            readonly serviceVersion?: unknown;
            readonly whisperxVersion?: unknown;
            readonly model?: unknown;
            readonly device?: unknown;
            readonly compute?: unknown;
            readonly batchSize?: unknown;
            readonly punktTabDigest?: unknown;
          };
          assert(healthValue.ok === true
            && healthValue.protocol === "svml.whisperx-service@1"
            && healthValue.serviceVersion === expectedServiceVersion
            && healthValue.whisperxVersion === expectedWhisperXVersion
            && healthValue.model === expectedModel
            && healthValue.device === expectedDevice
            && healthValue.compute === expectedCompute
            && healthValue.batchSize === expectedBatchSize
            && healthValue.punktTabDigest === expectedPunktTabDigest,
          "WhisperX service runtime identity differs from the configured Provider");
          const transcriptionResponse = await fetch(`${normalizedBaseUrl}/transcribe`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              audio_path: audioPath,
              ...(request.language === undefined ? {} : { language: request.language }),
            }),
            signal,
          });
          const raw = await limitedJson(transcriptionResponse, maxResponseBytes, "WhisperX transcription");
          assert(raw.value !== null && typeof raw.value === "object" && !Array.isArray(raw.value),
            "WhisperX transcription response is invalid");
          const response = raw.value as WhisperXServiceResponse;
          const segments = interpretWhisperXResponse(response, request.segments, request.sampleFrames / 16_000);
          const evidence: AlignedTranscriptEvidence = sealAlignedTranscriptEvidence({
            segments,
          });
          return result(canonicalize(evidence));
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
