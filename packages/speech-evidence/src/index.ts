import { assertBlobRef } from "@hypit/hypit/protocol";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { BlobRef, ModuleManifest } from "@hypit/hypit/protocol";
import type { PreparedAudioSource } from "@hypit/media";
import { assertLocalTemporalDomain } from "@hypit/temporal/algebra";
import { resolveTemporalBoundary } from "@hypit/temporal/sampling";
import type { LocalTemporalDomain, TemporalMap } from "@hypit/temporal";

export {
  speechEvidenceCapabilities,
  speechEvidenceModuleRef,
  speechEvidenceProducers,
  speechEvidenceTypes,
} from "./contract.js";
export {
  speechEvidenceAudioFragment,
  speechEvidenceGenerationNodes,
} from "./fragment.js";
import {
  speechEvidenceCapabilities,
  speechEvidenceModuleRef,
  speechEvidenceProducers,
  speechEvidenceTypes,
} from "./contract.js";

export type ProjectSpeechEvidenceAudioNeed = {
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
};

/** One invocation-local 16 kHz mono PCM projection accepted by speech analyzers. */
export type SpeechEvidenceAudio = {
  readonly artifact: BlobRef;
  readonly sampleFrames: number;
};

export const speechEvidenceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechEvidenceModuleRef.name,
  version: speechEvidenceModuleRef.version,
  dependencies: [mediaDependency],
  types: [speechEvidenceTypes.audio.name],
  capabilities: [{ name: speechEvidenceCapabilities.projectAudio.name, returns: speechEvidenceTypes.audio }],
  producers: [{
    name: speechEvidenceProducers.projectAudio.name,
    inputs: [{ name: "media", type: mediaTypes.prepared }],
    result: { kind: "need" as const, name: "evidenceAudio", capability: speechEvidenceCapabilities.projectAudio },
  }],
};
export const speechEvidenceDependency = speechEvidenceModuleRef;

function assertExactFields(value: unknown, fields: readonly string[], subject: string): void {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${subject} is invalid.`);
  const allowed = new Set(fields);
  const unexpected = Object.keys(value).find((field) => !allowed.has(field));
  if (unexpected !== undefined) throw new Error(`${subject} has unsupported field ${unexpected}.`);
}

export function speechEvidenceSampleFrames(domain: LocalTemporalDomain): number {
  assertLocalTemporalDomain(domain);
  const value = resolveTemporalBoundary(domain.duration,
    { frameRate: { numerator: 16_000, denominator: 1 } }, "nearest");
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Speech evidence sample domain is invalid.");
  return value;
}

export function sealSpeechEvidenceAudio(value: SpeechEvidenceAudio): SpeechEvidenceAudio {
  assertSpeechEvidenceAudioIdentity(value);
  return structuredClone(value);
}

export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  assertExactFields(value, ["artifact", "sampleFrames"], "SpeechEvidenceAudio");
  assertBlobRef(value.artifact, "SpeechEvidenceAudio.artifact");
  if (value.artifact.mediaType !== "audio/wav"
    || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) {
    throw new Error("SpeechEvidenceAudio identity is invalid.");
  }
}
