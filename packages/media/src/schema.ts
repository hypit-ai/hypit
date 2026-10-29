import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ValueSchema } from "@hypit/hypit/protocol";
import { exactTemporalValueSchema, localTemporalDomainSchema, temporalMapSchema } from "@hypit/temporal";
const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const rational = object({ numerator: { schema: { kind: "number", integer: true, minimum: 1 } }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } });
const primariesSchema: ValueSchema = { kind: "string", enum: ["bt709", "display-p3", "bt2020"] };
const transferSchema: ValueSchema = { kind: "string", enum: ["srgb", "bt709", "linear", "pq", "hlg"] };
const matrixSchema: ValueSchema = { kind: "string", enum: ["rgb", "bt709", "bt2020-ncl"] };
const rangeSchema: ValueSchema = { kind: "string", enum: ["full", "limited"] };
const bitDepthSchema: ValueSchema = { kind: "oneOf", variants: [8, 10, 12, 16].map((value) => ({ kind: "literal", value })) };
const alphaModeSchema: ValueSchema = { kind: "string", enum: ["opaque", "straight", "premultiplied"] };
export const pictureInterpretationSchema: ValueSchema = object({
  colorPrimaries: { schema: primariesSchema }, colorTransfer: { schema: transferSchema },
  colorMatrix: { schema: matrixSchema }, colorRange: { schema: rangeSchema }, bitDepth: { schema: bitDepthSchema },
  alphaMode: { schema: alphaModeSchema },
});
export const pictureObservationSchema: ValueSchema = object({
  colorPrimaries: { schema: primariesSchema, optional: true }, colorTransfer: { schema: transferSchema, optional: true },
  colorMatrix: { schema: matrixSchema, optional: true }, colorRange: { schema: rangeSchema, optional: true },
  bitDepth: { schema: bitDepthSchema, optional: true }, alphaMode: { schema: alphaModeSchema, optional: true },
});
export const workingPictureSpecSchema: ValueSchema = object({
  colorPrimaries: { schema: primariesSchema },
  colorTransfer: { schema: { kind: "string", enum: ["srgb", "linear"] } },
  referenceWhiteNits: { schema: { kind: "number", minimum: Number.MIN_VALUE } },
  alphaMode: { schema: { kind: "literal", value: "premultiplied" } },
});
const outputPictureBase = {
  colorPrimaries: { schema: primariesSchema },
  bitDepth: { schema: bitDepthSchema },
  alpha: { schema: object({
    mode: { schema: { kind: "literal", value: "opaque" } },
    matte: { schema: { kind: "string", minLength: 7, maxLength: 7 } },
  }) },
} as const;
const videoOutputPictureSpecSchema: ValueSchema = object({
  ...outputPictureBase,
  colorTransfer: { schema: { kind: "string", enum: ["bt709", "pq", "hlg"] } },
  colorMatrix: { schema: { kind: "string", enum: ["bt709", "bt2020-ncl"] } },
  colorRange: { schema: { kind: "literal", value: "limited" } },
});
const frameOutputPictureSpecSchema: ValueSchema = object({
  ...outputPictureBase,
  colorPrimaries: { schema: { kind: "string", enum: ["bt709", "display-p3"] } },
  colorTransfer: { schema: { kind: "string", enum: ["srgb", "linear"] } },
  colorMatrix: { schema: { kind: "literal", value: "rgb" } },
  colorRange: { schema: { kind: "literal", value: "full" } },
});
export const outputPictureSpecSchema: ValueSchema = {
  kind: "oneOf",
  variants: [videoOutputPictureSpecSchema, frameOutputPictureSpecSchema],
};
const chromaticitySchema = object({
  x: { schema: { kind: "number", minimum: 0, maximum: 1 } },
  y: { schema: { kind: "number", minimum: 0, maximum: 1 } },
});
export const hdrStaticMetadataSchema: ValueSchema = object({
  masteringDisplay: { schema: object({
    red: { schema: chromaticitySchema }, green: { schema: chromaticitySchema },
    blue: { schema: chromaticitySchema }, whitePoint: { schema: chromaticitySchema },
    minLuminanceNits: { schema: { kind: "number", minimum: 0 } },
    maxLuminanceNits: { schema: { kind: "number", minimum: Number.MIN_VALUE } },
  }) },
  contentLight: { schema: object({
    maxContentLightLevelNits: { schema: { kind: "number", integer: true, minimum: 0, maximum: 65_535 } },
    maxFrameAverageLightLevelNits: { schema: { kind: "number", integer: true, minimum: 0, maximum: 65_535 } },
  }) },
});
export const visualDeliverySpecSchema: ValueSchema = object({
  picture: { schema: videoOutputPictureSpecSchema },
  hdrStaticMetadata: { schema: hdrStaticMetadataSchema, optional: true },
  encoding: { schema: object({
    codec: { schema: { kind: "string", enum: ["h264", "hevc"] } },
    pixelFormat: { schema: { kind: "string", enum: ["yuv420p", "yuv420p10le", "yuv420p12le"] } },
    quality: { schema: { kind: "string", enum: ["draft", "standard", "high"] } },
  }) },
});
export const mediaDeliverySpecSchema: ValueSchema = object({
  visual: { schema: visualDeliverySpecSchema },
  audio: { schema: object({
    codec: { schema: { kind: "literal", value: "aac" } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    channelLayout: { schema: { kind: "literal", value: "stereo" } },
  }) },
  container: { schema: { kind: "literal", value: "mp4" } },
});
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
  picture: { schema: pictureObservationSchema },
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
  picture: { schema: pictureInterpretationSchema, optional: true },
});
const preparedMemberBase = {
  streamIndex: { schema: integer },
  presentationStart: { schema: exactTemporalValueSchema },
  sourceDomain: { schema: localTemporalDomainSchema },
  map: { schema: temporalMapSchema },
} as const;
const preparedVisualInterpretation = object({
  codedWidth: { schema: { kind: "number", integer: true, minimum: 1 } },
  codedHeight: { schema: { kind: "number", integer: true, minimum: 1 } },
  sampleAspectRatio: { schema: rational },
  rotationDegrees: { schema: { kind: "oneOf", variants: [0, 90, 180, 270]
    .map((value) => ({ kind: "literal" as const, value })) } },
  picture: { schema: pictureInterpretationSchema },
});
const preparedAudioInterpretation = object({
  sampleRate: { schema: { kind: "number", integer: true, minimum: 1 } },
  channels: { schema: { kind: "number", integer: true, minimum: 1 } },
  channelLayout: { schema: string, optional: true },
});
export const preparedMediaSchema: ValueSchema = object({
  source: { schema: blobRefSchema() },
  domain: { schema: localTemporalDomainSchema },
  visual: { optional: true, schema: object({
    ...preparedMemberBase,
    interpretation: { schema: preparedVisualInterpretation },
  }) },
  audio: { optional: true, schema: object({
    ...preparedMemberBase,
    interpretation: { schema: preparedAudioInterpretation },
  }) },
});
export const preparedVisualSourceSchema: ValueSchema = object({
  source: { schema: blobRefSchema() }, streamIndex: { schema: integer },
  presentationStart: { schema: exactTemporalValueSchema }, sourceDomain: { schema: localTemporalDomainSchema },
  interpretation: { schema: preparedVisualInterpretation },
});
export const preparedAudioSourceSchema: ValueSchema = object({
  source: { schema: blobRefSchema() }, streamIndex: { schema: integer },
  presentationStart: { schema: exactTemporalValueSchema }, sourceDomain: { schema: localTemporalDomainSchema },
  interpretation: { schema: preparedAudioInterpretation },
});
export const timelineVisualSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  delivery: { schema: visualDeliverySpecSchema },
  artifact: { schema: blobRefSchema() } });
export const timelineAudioSchema: ValueSchema = object({ artifact: { schema: blobRefSchema(["audio/wav"]) },
  sampleRate: { schema: { kind: "literal", value: 48_000 } }, channelLayout: { schema: { kind: "literal", value: "stereo" } },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } });
export const muxedMediaSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  presentationSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } }, delivery: { schema: mediaDeliverySpecSchema },
  artifact: { schema: blobRefSchema(["video/mp4"]) } });
const fontSourceSchema: ValueSchema = object({
  artifact: { schema: blobRefSchema(["font/otf", "font/ttf", "font/woff", "font/woff2"]) },
  unicodeRange: { schema: { kind: "string", minLength: 3 }, optional: true },
});
export const fontArtifactSchema: ValueSchema = object({ sources: { schema: { kind: "array", minItems: 1, items: fontSourceSchema } },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1_000 } }, style: { schema: { kind: "string", enum: ["normal", "italic", "oblique"] } } });
export const fontStackSchema: ValueSchema = object({ faces: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } } });
const surfaceTiming: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } } }),
  object({ kind: { schema: { kind: "literal", value: "frames" } }, frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
export const compositableSurfaceSchema: ValueSchema = object({ artifact: { schema: blobRefSchema() }, width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } }, picture: { schema: pictureInterpretationSchema },
  timing: { schema: surfaceTiming } });
