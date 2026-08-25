import { synchronizedMediaSchema } from "@hypit/media";
import type { ValueSchema } from "@hypit/protocol";
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
const semanticTakeToken = object({
  tokenId: { schema: string },
  segmentId: { schema: string },
  text: { schema: string },
  startAnchorId: { schema: string },
  endAnchorId: { schema: string },
  startFrame: { schema: integer },
  endFrameExclusive: { schema: integer },
});
const semanticTakeAnchor = object({ identity: { schema: string }, frame: { schema: integer } });
const semanticTakeSegment = object({
  segmentId: { schema: string },
  startAnchorId: { schema: string },
  endAnchorId: { schema: string },
  startFrame: { schema: integer },
  endFrameExclusive: { schema: integer },
});
export const speechDurationSchema: ValueSchema = number;
export const speechEvidenceAudioSchema: ValueSchema = object({
  artifact: { schema: audioBlobRef },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
});
export const semanticTakeSchema: ValueSchema = object({
  narrativeId: { schema: string },
  media: { schema: synchronizedMediaSchema },
  segment: { schema: semanticTakeSegment },
  tokens: { schema: { kind: "array", items: semanticTakeToken } },
  anchors: { schema: { kind: "array", items: semanticTakeAnchor } },
});
