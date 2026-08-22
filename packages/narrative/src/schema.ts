import type { ValueSchema } from "@hypit/protocol";

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });
export const narrativeSchema: ValueSchema = object({

  segments: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string }, startAnchorId: { schema: string },
    endAnchorId: { schema: string }, tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  tokens: { schema: { kind: "array", items: object({
    id: { schema: string }, segmentId: { schema: string },
    startAnchorId: { schema: string }, endAnchorId: { schema: string },
    text: { schema: string }, normalized: { schema: string },
  }) } },
  turns: { schema: { kind: "array", items: object({
    id: { schema: string }, segmentId: { schema: string }, role: { schema: string, optional: true },
    tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  selections: { schema: { kind: "array", items: object({
    id: { schema: string }, startAnchorId: { schema: string }, endAnchorId: { schema: string },
  }) } },
  moments: { schema: { kind: "array", items: object({
    id: { schema: string }, anchorId: { schema: string },
  }) } },
  semanticIndex: { schema: object({

    anchors: { schema: { kind: "array", minItems: 2, items: object({
      id: { schema: string },
      kind: { schema: { kind: "string", enum: ["segment-start", "token-start", "token-end", "segment-end"] } },
      segmentId: { schema: string }, tokenId: { schema: string, optional: true },
    }) } },
  }) },
});

export const narrativeExcerptSchema: ValueSchema = object({

  kind: { schema: { kind: "literal", value: "segment" } }, id: { schema: string },
  tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
});
const captionDisplayWord = object({
  id: { schema: string }, unitId: { schema: string }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true }, text: { schema: string },
  attributes: { schema: { kind: "array", items: object({
    name: { schema: string },
    value: { schema: { kind: "oneOf", variants: [string, { kind: "number" }, { kind: "boolean" }] } },
  }) } },
});
const captionAlignmentUnit = object({
  id: { schema: string }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true },
  wordIds: { schema: { kind: "array", minItems: 1, items: string } },
  sourceTokenIds: { schema: { kind: "array", minItems: 1, items: string } },
});
const captionCueBreak = object({ afterUnitId: { schema: string } });
export const captionDocumentSchema: ValueSchema = object({

  id: { schema: string },
  units: { schema: { kind: "array", minItems: 1, items: captionAlignmentUnit } },
  words: { schema: { kind: "array", minItems: 1, items: captionDisplayWord } },
  cueBreaks: { schema: { kind: "array", items: captionCueBreak } },
});
export const narrativeMomentSchema: ValueSchema = object({
  id: { schema: string },
  anchorId: { schema: string },
});
export const narrativeSelectionSchema: ValueSchema = object({
  id: { schema: string },
  startAnchorId: { schema: string }, endAnchorId: { schema: string },
});
