import { digestOf } from "@svml/core";
import type { ModuleManifest, TypeRef, ValueSchema } from "@svml/protocol";

export const scriptModuleRef = { name: "@svml/script", version: "0.0.0-dev" } as const;

export const narrativeType: TypeRef = {
  module: scriptModuleRef,
  name: "Narrative",
};

export const scriptSurfaceImplementationDigest = digestOf("@svml/script/surface@0");

const stringSchema = { kind: "string", minLength: 1 } as const;
const integerSchema = { kind: "number", integer: true, minimum: 0 } as const;
const boundarySchema: ValueSchema = {
  kind: "object",
  fields: {
    tokenIndex: { schema: integerSchema },
    structuralPosition: { schema: integerSchema },
    segmentId: { schema: stringSchema, optional: true },
  },
};
const edgeSchema: ValueSchema = {
  kind: "object",
  fields: {
    affinity: { schema: { kind: "string", enum: ["left", "right"] } },
    boundary: { schema: boundarySchema },
  },
};

export const narrativeSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.narrative@0" } },
    segments: {
      schema: {
        kind: "array",
        minItems: 1,
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            index: { schema: integerSchema },
            startAnchorId: { schema: stringSchema },
            endAnchorId: { schema: stringSchema },
            tokenStart: { schema: integerSchema },
            tokenEndExclusive: { schema: integerSchema },
          },
        },
      },
    },
    tokens: {
      schema: {
        kind: "array",
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            index: { schema: integerSchema },
            segmentId: { schema: stringSchema },
            segmentTokenIndex: { schema: integerSchema },
            startAnchorId: { schema: stringSchema },
            endAnchorId: { schema: stringSchema },
            text: { schema: stringSchema },
            normalized: { schema: stringSchema },
          },
        },
      },
    },
    turns: {
      schema: {
        kind: "array",
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            segmentId: { schema: stringSchema },
            role: { schema: stringSchema, optional: true },
            tokenStart: { schema: integerSchema },
            tokenEndExclusive: { schema: integerSchema },
          },
        },
      },
    },
    selections: {
      schema: {
        kind: "array",
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            occurrences: {
              schema: {
                kind: "array",
                minItems: 1,
                items: {
                  kind: "object",
                  fields: {
                    occurrence: { schema: integerSchema },
                    open: { schema: edgeSchema },
                    close: { schema: edgeSchema },
                  },
                },
              },
            },
          },
        },
      },
    },
    moments: {
      schema: {
        kind: "array",
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            occurrences: {
              schema: {
                kind: "array",
                minItems: 1,
                items: {
                  kind: "object",
                  fields: {
                    occurrence: { schema: integerSchema },
                    affinity: { schema: { kind: "string", enum: ["left", "right"] } },
                    boundary: { schema: boundarySchema },
                  },
                },
              },
            },
          },
        },
      },
    },
    captionAtoms: {
      schema: {
        kind: "array",
        items: {
          kind: "object",
          fields: {
            id: { schema: stringSchema },
            display: { schema: { kind: "string" } },
            segmentId: { schema: stringSchema },
            startToken: { schema: integerSchema },
            endTokenExclusive: { schema: integerSchema },
          },
        },
      },
    },
    semanticIndex: {
      schema: {
        kind: "object",
        fields: {
          contract: { schema: { kind: "literal", value: "svml.semantic-index@0" } },
          anchors: {
            schema: {
              kind: "array",
              minItems: 2,
              items: {
                kind: "object",
                fields: {
                  id: { schema: stringSchema },
                  kind: {
                    schema: {
                      kind: "string",
                      enum: ["segment-start", "token-start", "token-end", "segment-end"],
                    },
                  },
                  segmentId: { schema: stringSchema },
                  tokenId: { schema: stringSchema, optional: true },
                  segmentTokenIndex: { schema: integerSchema, optional: true },
                },
              },
            },
          },
          digest: { schema: stringSchema },
        },
      },
    },
    projections: {
      schema: {
        kind: "object",
        fields: {
          dialogue: { schema: { kind: "string" } },
          speech: { schema: { kind: "string" } },
          caption: { schema: { kind: "string" } },
        },
      },
    },
  },
};

export const scriptManifest: ModuleManifest = {
  format: "svml.module@0",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [],
  types: [
    {
      name: narrativeType.name,
      schema: narrativeSchema,
      description: "Authoritative narrative, projections and 2M + 2N semantic identities.",
    },
  ],
  surfaces: [
    {
      name: "script",
      tag: "script",
      mode: "raw",
      outputs: [narrativeType],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@svml/script/surface",
        digest: scriptSurfaceImplementationDigest,
      },
    },
  ],
  producers: [],
};
