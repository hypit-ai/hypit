import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { AlignedTranscriptEvidence } from "@hypit/speech-evidence";
import type { EndpointInvocationContext, EndpointFulfillment } from "@hypit/endpoint-kit";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import {
  assertWhisperXEvidenceWav,
  interpretWhisperXTranscript,
  verifyWhisperXAlignmentRequest,
  whisperXCapabilities,
} from "@hypit/whisperx";
import type { WhisperXTranscriptResponse } from "@hypit/whisperx";

export const localWhisperXProviderModuleRef = {
  name: "@hypit/provider-whisperx-local",
  version: "1",
} as const;
export type CreateLocalWhisperXProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  /** Must resolve to the same machine because the protocol passes a staged local path. */
  readonly baseUrl?: string;
  readonly expectedModel?: string;
  readonly expectedDevice?: string;
  readonly expectedCompute?: string;
  readonly expectedBatchSize?: number;
  readonly expectedServiceVersion?: string;
  readonly expectedWhisperXVersion?: string;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
};

export type WhisperXServiceResponse = WhisperXTranscriptResponse;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

export const interpretWhisperXResponse = interpretWhisperXTranscript;

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
  assert(expectedModel.trim().length > 0, "expectedModel is empty");
  assert(expectedDevice.trim().length > 0, "expectedDevice is empty");
  assert(expectedCompute.trim().length > 0, "expectedCompute is empty");
  assert(expectedServiceVersion.trim().length > 0, "expectedServiceVersion is empty");
  assert(expectedWhisperXVersion.trim().length > 0, "expectedWhisperXVersion is empty");
  const requestTimeoutMs = positiveInteger(config.requestTimeoutMs ?? 10 * 60_000, "requestTimeoutMs");
  const maxResponseBytes = positiveInteger(config.maxResponseBytes ?? 64 * 1024 * 1024, "maxResponseBytes");

  return defineEndpointPackage({
    module: localWhisperXProviderModuleRef,
    facet: "alignment",
    instance: config.instance ?? "whisperx.local",
    pool: config.pool ?? config.instance ?? "whisperx.local",
    pricing: { kind: "local" },
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: whisperXCapabilities.alignment,
      returns: speechEvidenceTypes.alignedTranscript,
      handler: async (context: EndpointInvocationContext) => {
        const request = verifyWhisperXAlignmentRequest(context.need.constraints);
        const audio = await context.resources.get(request.audio.resource);
        assert(audio !== undefined && audio.byteLength === request.audio.size,
          `WhisperX evidence Artifact ${request.audio.resource} is unavailable or has changed`);
        assertWhisperXEvidenceWav(audio, request.sampleFrames);
        const work = await mkdtemp(join(tmpdir(), "hypit-whisperx-local-"));
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
          };
          assert(healthValue.ok === true
            && healthValue.protocol === "hypit.whisperx-service@1"
            && healthValue.serviceVersion === expectedServiceVersion
            && healthValue.whisperxVersion === expectedWhisperXVersion
            && healthValue.model === expectedModel
            && healthValue.device === expectedDevice
            && healthValue.compute === expectedCompute
            && healthValue.batchSize === expectedBatchSize,
          "WhisperX service runtime identity differs from the configured Provider");
          const transcriptionResponse = await fetch(`${normalizedBaseUrl}/transcribe`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              audio_path: audioPath,
              language: request.language,
            }),
            signal,
          });
          const raw = await limitedJson(transcriptionResponse, maxResponseBytes, "WhisperX transcription");
          assert(raw.value !== null && typeof raw.value === "object" && !Array.isArray(raw.value),
            "WhisperX transcription response is invalid");
          const response = raw.value as WhisperXServiceResponse;
          const passages = interpretWhisperXResponse(response, request.sampleFrames);
          const evidence: AlignedTranscriptEvidence = sealAlignedTranscriptEvidence({
            passages,
          });
          return result(canonicalize(evidence));
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
