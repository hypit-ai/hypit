import type { ValueSchema } from "@narratage/protocol";
const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const seconds = { kind: "number", minimum: 0, format: "duration" } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
// 71 is `sha256:` plus 64 hex characters. The format states the shape the
// length was only ever approximating.
const digest = { kind: "string", minLength: 71, maxLength: 71, format: "digest" } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
export const mediaArtifactSchema = object({ digest: { schema: digest }, size: { schema: integer }, mediaType: { schema: string }, durationSec: { schema: seconds } });
const blobArtifactSchema = (mediaTypes?: readonly string[]): ValueSchema => object({
  kind: { schema: { kind: "literal", value: "blob" } }, digest: { schema: digest }, size: { schema: integer },
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
  contract: { schema: { kind: "literal", value: "svml.media-inspection@1" } },
  container: { schema: object({ formatNames: { schema: { kind: "array", minItems: 1, items: string } } }) },
  streams: { schema: { kind: "array", items: { kind: "oneOf", variants: [videoStream, audioStream, otherStream] } } },
});
export const mediaStreamSelectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-stream-selection@1" } },
  videoStreamIndex: { schema: integer, optional: true }, audioStreamIndex: { schema: integer, optional: true },
  spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
  policy: { schema: { kind: "string", enum: ["primary-moving@1", "default-audio@1", "primary-moving-default-audio@1", "explicit-streams@1"] } },
});
export const synchronizedMediaSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.synchronized-media@1" } },
  timeline: { schema: object({ spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } }, frameRate: { schema: rational },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } }, sampleRate: { schema: { kind: "literal", value: 48_000 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  sourceMap: { schema: object({ sourceOriginPts: { schema: timestamp }, sourceEndPts: { schema: timestamp }, audioTrimStartSamples: { schema: integer },
    audioTrimEndSamples: { schema: integer }, audioHeadSamples: { schema: integer }, audioContentSamples: { schema: integer }, audioTailSamples: { schema: integer } }) },
  visual: { schema: object({ artifact: { schema: blobArtifactSchema() }, sourceStreamIndex: { schema: integer },
    width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } },
    frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } }, muted: { schema: { kind: "literal", value: true } } }), optional: true },
  audio: { schema: object({ artifact: { schema: blobArtifactSchema(["audio/wav"]) }, sourceStreamIndex: { schema: integer }, codec: { schema: { kind: "literal", value: "pcm_s16le" } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } }, channels: { schema: { kind: "literal", value: 2 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, loudness: { schema: { kind: "literal", value: "preserved" } } }), optional: true },
});
export const renderedVisualSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.rendered-visual@1" } },
  frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  artifact: { schema: blobArtifactSchema() }, muted: { schema: { kind: "literal", value: true } } });
export const timelineAudioSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.timeline-audio@1" } },
  artifact: { schema: blobArtifactSchema(["audio/wav"]) }, codec: { schema: { kind: "literal", value: "pcm_s16le" } },
  sampleRate: { schema: { kind: "literal", value: 48_000 } }, channels: { schema: { kind: "literal", value: 2 } },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, loudness: { schema: { kind: "literal", value: "planned" } } });
export const muxedMediaSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.muxed-media@1" } },
  frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  presentationSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, artifact: { schema: blobArtifactSchema(["video/mp4"]) } });
const fontSourceSchema: ValueSchema = object({
  artifact: { schema: blobArtifactSchema(["font/otf", "font/ttf", "font/woff", "font/woff2"]) },
  unicodeRange: { schema: { kind: "string", minLength: 3 }, optional: true },
});
export const fontArtifactSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.font-artifact@1" } },
  sources: { schema: { kind: "array", minItems: 1, items: fontSourceSchema } },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1_000 } }, style: { schema: { kind: "string", enum: ["normal", "italic", "oblique"] } } });
export const fontStackSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.font-stack@1" } },
  faces: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } } });
const surfaceTiming: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } } }),
  object({ kind: { schema: { kind: "literal", value: "frames" } }, frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
export const compositableSurfaceSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.compositable-surface@1" } },
  artifact: { schema: blobArtifactSchema() }, width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } }, colorSpace: { schema: { kind: "literal", value: "srgb" } },
  alphaMode: { schema: { kind: "string", enum: ["opaque", "straight"] } }, timing: { schema: surfaceTiming } });
