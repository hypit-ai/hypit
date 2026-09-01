import type { ValueSchema } from "@hypit/protocol";
const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const seconds = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
// Structural admission fixes the length; media Type validators prove the
// content-addressed identity wherever the value carries semantic media truth.
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blobArtifactSchema = (mediaTypes?: readonly string[]): ValueSchema => object({
  kind: { schema: { kind: "literal", value: "blob" } }, resource: { schema: string, optional: true },
  origin: { schema: object({
    kind: { schema: { kind: "literal", value: "build-file" } },
    build: { schema: string }, path: { schema: string },
  }), optional: true },
  digest: { schema: digest }, size: { schema: integer },
  mediaType: { schema: mediaTypes === undefined ? string : { kind: "string", enum: mediaTypes } },
});
const rational = object({ numerator: { schema: { kind: "number", integer: true, minimum: 1 } }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } });
const timestamp = object({ ticks: { schema: { kind: "string", minLength: 1, maxLength: 128 } }, timeBase: { schema: rational } });
const disposition = object({ default: { schema: { kind: "boolean" } }, attachedPicture: { schema: { kind: "boolean" } } });
const streamBase = {
  index: { schema: integer }, codecType: { schema: string }, codecName: { schema: string }, disposition: { schema: disposition },
  timingStatus: { schema: { kind: "string", enum: ["admissible", "missing", "non-monotonic", "discontinuous"] } },
  timeBase: { schema: rational, optional: true }, startPts: { schema: timestamp, optional: true },
  endPts: { schema: timestamp, optional: true }, decodedUnitCount: { schema: integer },
} as const;
const videoStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "video" } }, codecType: { schema: { kind: "literal", value: "video" } },
  role: { schema: { kind: "string", enum: ["moving", "attached-picture", "still"] } }, width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } }, sampleAspectRatio: { schema: rational },
  rotationDegrees: { schema: { kind: "oneOf", variants: [0, 90, 180, 270].map((value) => ({ kind: "literal", value })) } },
  averageFrameRate: { schema: rational, optional: true }, nominalFrameRate: { schema: rational, optional: true } });
const audioStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "audio" } }, codecType: { schema: { kind: "literal", value: "audio" } },
  sampleRate: { schema: { kind: "number", integer: true, minimum: 1 } }, channels: { schema: { kind: "number", integer: true, minimum: 1 } },
  channelLayout: { schema: string, optional: true }, decodedSampleFrames: { schema: integer } });
const otherStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "other" } } });
export const mediaInspectionSchema: ValueSchema = object({
  container: { schema: object({ formatNames: { schema: { kind: "array", minItems: 1, items: string } } }) },
  streams: { schema: { kind: "array", items: { kind: "oneOf", variants: [videoStream, audioStream, otherStream] } } },
});
export const mediaStreamSelectionSchema: ValueSchema = object({
  videoStreamIndex: { schema: integer, optional: true }, audioStreamIndex: { schema: integer, optional: true },
  spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
  policy: { schema: { kind: "string", enum: ["primary-moving@1", "default-audio@1", "primary-moving-default-audio@1", "explicit-streams@1"] } },
});
export const synchronizedMediaSchema: ValueSchema = object({
  timeline: { schema: object({ frameRate: { schema: rational },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  visual: { schema: object({ artifact: { schema: blobArtifactSchema() },
    width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } },
  }), optional: true },
  audio: { schema: object({ artifact: { schema: blobArtifactSchema(["audio/wav"]) } }), optional: true },
});
export const renderedVisualSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  artifact: { schema: blobArtifactSchema() } });
export const timelineAudioSchema: ValueSchema = object({ artifact: { schema: blobArtifactSchema(["audio/wav"]) },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } });
export const muxedMediaSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  presentationSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, artifact: { schema: blobArtifactSchema(["video/mp4"]) } });
const fontSourceSchema: ValueSchema = object({
  artifact: { schema: blobArtifactSchema(["font/otf", "font/ttf", "font/woff", "font/woff2"]) },
  unicodeRange: { schema: { kind: "string", minLength: 3 }, optional: true },
});
export const fontArtifactSchema: ValueSchema = object({ sources: { schema: { kind: "array", minItems: 1, items: fontSourceSchema } },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1_000 } }, style: { schema: { kind: "string", enum: ["normal", "italic", "oblique"] } } });
export const fontStackSchema: ValueSchema = object({ faces: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } } });
const surfaceTiming: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } } }),
  object({ kind: { schema: { kind: "literal", value: "frames" } }, frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
export const compositableSurfaceSchema: ValueSchema = object({ artifact: { schema: blobArtifactSchema() }, width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } }, colorSpace: { schema: { kind: "literal", value: "srgb" } },
  alphaMode: { schema: { kind: "string", enum: ["opaque", "straight"] } }, timing: { schema: surfaceTiming } });
