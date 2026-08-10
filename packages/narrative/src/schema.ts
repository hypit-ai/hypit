import type { ValueSchema } from "@narratage/protocol";

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });
export const narrativeSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative@1" } },
  segments: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string }, index: { schema: integer }, startAnchorId: { schema: string },
    endAnchorId: { schema: string }, tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  tokens: { schema: { kind: "array", items: object({
    id: { schema: string }, index: { schema: integer }, segmentId: { schema: string },
    segmentTokenIndex: { schema: integer }, startAnchorId: { schema: string }, endAnchorId: { schema: string },
    text: { schema: string }, normalized: { schema: string },
  }) } },
  turns: { schema: { kind: "array", items: object({
    id: { schema: string }, segmentId: { schema: string }, role: { schema: string, optional: true },
    tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  selections: { schema: { kind: "array", items: object({
    id: { schema: string }, occurrences: { schema: { kind: "array", minItems: 1, items: object({
      occurrence: { schema: integer }, startAnchorId: { schema: string }, endAnchorId: { schema: string },
    }) } },
  }) } },
  moments: { schema: { kind: "array", items: object({
    id: { schema: string }, occurrences: { schema: { kind: "array", minItems: 1, items: object({
      occurrence: { schema: integer }, anchorId: { schema: string },
    }) } },
  }) } },
  semanticIndex: { schema: object({
    contract: { schema: { kind: "literal", value: "svml.semantic-index@1" } },
    anchors: { schema: { kind: "array", minItems: 2, items: object({
      id: { schema: string },
      kind: { schema: { kind: "string", enum: ["segment-start", "token-start", "token-end", "segment-end"] } },
      segmentId: { schema: string }, tokenId: { schema: string, optional: true },
      segmentTokenIndex: { schema: integer, optional: true },
    }) } },
  }) },
});

export const narrativeExcerptSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-excerpt@1" } },
  kind: { schema: { kind: "literal", value: "segment" } }, id: { schema: string },
  tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
});
const captionDisplayWord = object({
  id: { schema: string }, index: { schema: integer }, atomId: { schema: string }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true }, text: { schema: string },
});
const captionDisplayAtom = object({
  id: { schema: string }, index: { schema: integer }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true },
  wordIds: { schema: { kind: "array", minItems: 1, items: string } },
});
export const captionDisplaySequenceSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-display-sequence@1" } },
  id: { schema: string },
  atoms: { schema: { kind: "array", minItems: 1, items: captionDisplayAtom } },
  words: { schema: { kind: "array", minItems: 1, items: captionDisplayWord } },
});
export const captionCorrespondenceSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-correspondence@1" } },
  displaySequenceId: { schema: string },
  atoms: { schema: { kind: "array", minItems: 1, items: object({
    atomId: { schema: string }, sourceTokenIds: { schema: { kind: "array", minItems: 1, items: string } },
  }) } },
});
export const captionDisplayWordSubsetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-display-word-subset@1" } },
  id: { schema: string }, sequenceId: { schema: string },
  wordIds: { schema: { kind: "array", items: string } },
});
export const narrativeMomentSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-moment@1" } }, id: { schema: string },
  occurrences: { schema: { kind: "array", minItems: 1, items: object({
    occurrence: { schema: integer }, anchorId: { schema: string },
  }) } },
});
export const narrativeSelectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-selection@1" } }, id: { schema: string },
  occurrences: { schema: { kind: "array", minItems: 1, items: object({
    occurrence: { schema: integer }, startAnchorId: { schema: string }, endAnchorId: { schema: string },
  }) } },
});
