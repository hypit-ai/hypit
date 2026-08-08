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
  captionProjection: { schema: object({
    contract: { schema: { kind: "literal", value: "svml.caption-projection@1" } },
    text: { schema: { kind: "string" } },
    regions: { schema: { kind: "array", items: object({
      id: { schema: string }, display: { schema: { kind: "string" } }, segmentId: { schema: string },
      startToken: { schema: integer }, endTokenExclusive: { schema: integer },
      kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
      refinements: { schema: { kind: "array", items: object({
        id: { schema: string }, display: { schema: string }, displayStart: { schema: integer },
        displayEnd: { schema: integer }, startToken: { schema: integer }, endTokenExclusive: { schema: integer },
        relation: { schema: { kind: "literal", value: "exact" } },
      }) } },
    }) } },
  }) },
  semanticIndex: { schema: object({
    contract: { schema: { kind: "literal", value: "svml.semantic-index@1" } },
    anchors: { schema: { kind: "array", minItems: 2, items: object({
      id: { schema: string },
      kind: { schema: { kind: "string", enum: ["segment-start", "token-start", "token-end", "segment-end"] } },
      segmentId: { schema: string }, tokenId: { schema: string, optional: true },
      segmentTokenIndex: { schema: integer, optional: true },
    }) } },
  }) },
  serializations: { schema: object({
    dialogue: { schema: { kind: "string" } }, speech: { schema: { kind: "string" } },
  }) },
});

export const narrativeExcerptSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-excerpt@1" } },
  kind: { schema: { kind: "literal", value: "segment" } }, id: { schema: string },
  tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  serializations: { schema: object({ dialogue: { schema: string }, speech: { schema: string } }) },
});
export const narrativeDialogueExcerptSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-dialogue-excerpt@1" } },
  kind: { schema: { kind: "literal", value: "segment" } }, id: { schema: string },
  tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer }, dialogue: { schema: string },
});
export const narrativeSpeechExcerptSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative-speech-excerpt@1" } },
  kind: { schema: { kind: "literal", value: "segment" } }, id: { schema: string },
  tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer }, speech: { schema: string },
});
export const captionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-projection@1" } },
  text: { schema: { kind: "string" } },
  regions: { schema: { kind: "array", items: object({
    id: { schema: string }, display: { schema: { kind: "string" } }, segmentId: { schema: string },
    startToken: { schema: integer }, endTokenExclusive: { schema: integer },
    kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
    refinements: { schema: { kind: "array", items: object({
      id: { schema: string }, display: { schema: string }, displayStart: { schema: integer },
      displayEnd: { schema: integer }, startToken: { schema: integer }, endTokenExclusive: { schema: integer },
      relation: { schema: { kind: "literal", value: "exact" } },
    }) } },
  }) } },
});
const captionWord = object({
  id: { schema: string }, index: { schema: integer }, regionId: { schema: string }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true }, text: { schema: string },
  displayStart: { schema: integer }, displayEnd: { schema: integer }, sourceTokenStart: { schema: integer },
  sourceTokenEndExclusive: { schema: integer },
  correspondence: { schema: { kind: "string", enum: ["exact", "region-envelope"] } },
});
export const captionWordSequenceSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-word-sequence@1" } },
  id: { schema: string }, words: { schema: { kind: "array", minItems: 1, items: captionWord } },
});
export const captionWordSubsetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-word-subset@1" } },
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
