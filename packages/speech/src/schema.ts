import { programSpaceSchema } from "@narratage/program-space";
import type { ValueSchema } from "@narratage/protocol";
import { contentFitSchema, intrinsicExtentSchema, spatialFrameSchema } from "@narratage/spatial";
const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const audioBlobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: digest },
  size: { schema: integer },
  mediaType: { schema: { kind: "literal", value: "audio/wav" } },
});
const segment = object({ segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number } });
export const speechDurationSchema: ValueSchema = number;
export const speechBasisSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-basis@1" } }, programSpace: { schema: programSpaceSchema }, audio: { schema: audioBlobRef },
  visualTrack: { schema: object({ clips: { schema: { kind: "array", items: object({ segmentId: { schema: string }, artifact: { schema: object({
    kind: { schema: { kind: "literal", value: "blob" } }, digest: { schema: digest }, size: { schema: integer }, mediaType: { schema: string },
  }) }, span: { schema: object({
    startFrame: { schema: integer }, endFrameExclusive: { schema: integer },
  }) }, extent: { schema: intrinsicExtentSchema }, frameRate: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  frame: { schema: spatialFrameSchema }, fit: { schema: contentFitSchema },
  stackingOrder: { schema: { kind: "number", integer: true } },
  }) } } }) },
  segments: { schema: { kind: "array", minItems: 1, items: segment } },
});
export const speechAudioBasisSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.speech-audio-basis@1" } },
  programSpace: { schema: programSpaceSchema }, audio: { schema: audioBlobRef }, segments: { schema: { kind: "array", minItems: 1, items: segment } } });
export const speechEvidenceAudioSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.speech-evidence-audio@1" } },
  artifact: { schema: audioBlobRef },
  codec: { schema: { kind: "literal", value: "pcm_s16le" } }, sampleRate: { schema: { kind: "literal", value: 16_000 } }, channels: { schema: { kind: "literal", value: 1 } },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, durationSec: { schema: number },
  segments: { schema: { kind: "array", minItems: 1, items: segment } }, sampleMap: { schema: object({
    algorithm: { schema: { kind: "literal", value: "rational-boundary-round@1" } }, sourceSampleRate: { schema: { kind: "literal", value: 48_000 } },
    evidenceSampleRate: { schema: { kind: "literal", value: 16_000 } }, sourceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    evidenceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, sourceOriginSample: { schema: { kind: "literal", value: 0 } },
    evidenceOriginSample: { schema: { kind: "literal", value: 0 } },
  }) },
});
