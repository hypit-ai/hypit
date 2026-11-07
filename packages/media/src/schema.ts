import { blobRefSchema } from "@hypit/protocol";
import type { ValueSchema } from "@hypit/protocol";
import { exactTemporalValueSchema, localTemporalDomainSchema, temporalMapSchema } from "@hypit/temporal";
const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const rational = object({ numerator: { schema: { kind: "number", integer: true, minimum: 1 } }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } });
const observedPrimariesSchema: ValueSchema = { kind: "literal", value: "bt709" };
const observedTransferSchema: ValueSchema = { kind: "string", enum: ["srgb", "bt709"] };
const observedMatrixSchema: ValueSchema = { kind: "string", enum: ["rgb", "bt709"] };
const rangeSchema: ValueSchema = { kind: "string", enum: ["full", "limited"] };
const observedBitDepthSchema: ValueSchema = { kind: "literal", value: 8 };
const alphaModeSchema: ValueSchema = { kind: "string", enum: ["opaque", "straight", "premultiplied"] };
export const pictureInterpretationSchema: ValueSchema = { kind: "oneOf", variants: [
  object({
    colorPrimaries: { schema: { kind: "literal", value: "bt709" } },
    colorTransfer: { schema: { kind: "literal", value: "srgb" } },
    colorMatrix: { schema: { kind: "literal", value: "rgb" } },
    colorRange: { schema: { kind: "literal", value: "full" } },
    bitDepth: { schema: { kind: "literal", value: 8 } },
    alphaMode: { schema: { kind: "string", enum: ["opaque", "straight"] } },
  }),
  object({
    colorPrimaries: { schema: { kind: "literal", value: "bt709" } },
    colorTransfer: { schema: { kind: "literal", value: "bt709" } },
    colorMatrix: { schema: { kind: "literal", value: "bt709" } },
    colorRange: { schema: { kind: "literal", value: "limited" } },
    bitDepth: { schema: { kind: "literal", value: 8 } },
    alphaMode: { schema: { kind: "string", enum: ["opaque", "straight"] } },
  }),
] };
export const pictureObservationSchema: ValueSchema = object({
  colorPrimaries: { schema: observedPrimariesSchema, optional: true }, colorTransfer: { schema: observedTransferSchema, optional: true },
  colorMatrix: { schema: observedMatrixSchema, optional: true }, colorRange: { schema: rangeSchema, optional: true },
  bitDepth: { schema: observedBitDepthSchema, optional: true }, alphaMode: { schema: alphaModeSchema, optional: true },
});
const outputPictureBase = {
  colorPrimaries: { schema: { kind: "literal", value: "bt709" } },
  bitDepth: { schema: { kind: "literal", value: 8 } },
  alpha: { schema: object({
    mode: { schema: { kind: "literal", value: "opaque" } },
    matte: { schema: { kind: "string", minLength: 7, maxLength: 7 } },
  }) },
} as const;
const videoOutputPictureSpecSchema: ValueSchema = object({
  ...outputPictureBase,
  colorTransfer: { schema: { kind: "literal", value: "bt709" } },
  colorMatrix: { schema: { kind: "literal", value: "bt709" } },
  colorRange: { schema: { kind: "literal", value: "limited" } },
});
const frameOutputPictureSpecSchema: ValueSchema = object({
  ...outputPictureBase,
  colorTransfer: { schema: { kind: "literal", value: "srgb" } },
  colorMatrix: { schema: { kind: "literal", value: "rgb" } },
  colorRange: { schema: { kind: "literal", value: "full" } },
});
export const outputPictureSpecSchema: ValueSchema = {
  kind: "oneOf",
  variants: [videoOutputPictureSpecSchema, frameOutputPictureSpecSchema],
};
export const visualDeliverySpecSchema: ValueSchema = object({
  picture: { schema: videoOutputPictureSpecSchema },
  encoding: { schema: object({
    codec: { schema: { kind: "literal", value: "h264" } },
    pixelFormat: { schema: { kind: "literal", value: "yuv420p" } },
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
  index: { schema: integer }, codecName: { schema: string }, disposition: { schema: disposition },
  startPts: { schema: timestamp, optional: true },
  endPts: { schema: timestamp, optional: true },
} as const;
const videoStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "video" } }, decodedUnitCount: { schema: integer },
  width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } }, sampleAspectRatio: { schema: rational },
  picture: { schema: pictureObservationSchema },
  rotationDegrees: { schema: { kind: "oneOf", variants: [0, 90, 180, 270].map((value) => ({ kind: "literal", value })) } },
  averageFrameRate: { schema: rational, optional: true } });
const audioStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "audio" } },
  sampleRate: { schema: { kind: "number", integer: true, minimum: 1 } }, channels: { schema: { kind: "number", integer: true, minimum: 1 } },
  decodedSampleFrames: { schema: integer } });
const otherStream = object({ ...streamBase, kind: { schema: { kind: "literal", value: "other" } },
  codecType: { schema: string } });
export const mediaInspectionSchema: ValueSchema = object({
  streams: { schema: { kind: "array", items: { kind: "oneOf", variants: [videoStream, audioStream, otherStream] } } },
});
export const mediaStreamSelectionSchema: ValueSchema = object({
  videoStreamIndex: { schema: integer, optional: true }, audioStreamIndex: { schema: integer, optional: true },
  spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] }, optional: true },
  picture: { schema: pictureInterpretationSchema, optional: true },
});
const preparedMemberBase = {
  streamIndex: { schema: integer },
  presentationStart: { schema: exactTemporalValueSchema },
  sourceDomain: { schema: localTemporalDomainSchema },
  map: { schema: temporalMapSchema },
} as const;
const preparedPictureInterpretation = object({
  codedWidth: { schema: { kind: "number", integer: true, minimum: 1 } },
  codedHeight: { schema: { kind: "number", integer: true, minimum: 1 } },
  sampleAspectRatio: { schema: rational },
  rotationDegrees: { schema: { kind: "oneOf", variants: [0, 90, 180, 270]
    .map((value) => ({ kind: "literal" as const, value })) } },
  picture: { schema: pictureInterpretationSchema },
});
export const preparedMediaSchema: ValueSchema = object({
  id: { schema: string },
  source: { schema: blobRefSchema() },
  domain: { schema: localTemporalDomainSchema, optional: true },
  picture: { optional: true, schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "constant" } }, streamIndex: { schema: integer },
      interpretation: { schema: preparedPictureInterpretation } }),
    object({ kind: { schema: { kind: "literal", value: "signal" } }, ...preparedMemberBase,
      interpretation: { schema: preparedPictureInterpretation } }),
  ] } },
  audio: { optional: true, schema: object({
    ...preparedMemberBase,
  }) },
});
export const preparedPictureSourceSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ source: { schema: blobRefSchema() }, kind: { schema: { kind: "literal", value: "constant" } },
    streamIndex: { schema: integer }, interpretation: { schema: preparedPictureInterpretation } }),
  object({ source: { schema: blobRefSchema() }, kind: { schema: { kind: "literal", value: "signal" } },
    streamIndex: { schema: integer }, presentationStart: { schema: exactTemporalValueSchema },
    sourceDomain: { schema: localTemporalDomainSchema }, interpretation: { schema: preparedPictureInterpretation } }),
] };
export const preparedSignalPictureSourceSchema: ValueSchema = object({
  source: { schema: blobRefSchema() }, kind: { schema: { kind: "literal", value: "signal" } },
  streamIndex: { schema: integer }, presentationStart: { schema: exactTemporalValueSchema },
  sourceDomain: { schema: localTemporalDomainSchema }, interpretation: { schema: preparedPictureInterpretation },
});
export const preparedAudioSourceSchema: ValueSchema = object({
  source: { schema: blobRefSchema() }, streamIndex: { schema: integer },
  presentationStart: { schema: exactTemporalValueSchema }, sourceDomain: { schema: localTemporalDomainSchema },
});
export const renderedVisualSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  delivery: { schema: visualDeliverySpecSchema },
  artifact: { schema: blobRefSchema() } });
export const renderedAudioSchema: ValueSchema = object({ artifact: { schema: blobRefSchema(["audio/wav"]) },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } });
export const muxedMediaSchema: ValueSchema = object({ frameRate: { schema: rational }, frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({ width: { schema: { kind: "number", integer: true, minimum: 1 } }, height: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  delivery: { schema: mediaDeliverySpecSchema },
  artifact: { schema: blobRefSchema(["video/mp4"]) } });
const fontSourceSchema: ValueSchema = object({
  artifact: { schema: blobRefSchema(["font/otf", "font/ttf", "font/woff", "font/woff2"]) },
  unicodeRange: { schema: { kind: "string", minLength: 3 }, optional: true },
});
export const fontArtifactSchema: ValueSchema = object({ sources: { schema: { kind: "array", minItems: 1, items: fontSourceSchema } },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1_000 } }, style: { schema: { kind: "string", enum: ["normal", "italic", "oblique"] } } });
export const fontStackSchema: ValueSchema = object({ faces: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } } });
const selectionMode = (name: string): ValueSchema => object({
  mode: { schema: { kind: "literal", value: name } },
});
const streamSelectionMode: ValueSchema = object({
  mode: { schema: { kind: "literal", value: "stream-index" } },
  streamIndex: { schema: integer },
});
export const mediaSelectionRequestSchema: ValueSchema = object({
  video: { schema: { kind: "oneOf", variants: [
    selectionMode("primary-moving"), selectionMode("primary-picture"), streamSelectionMode, selectionMode("none"),
  ] } },
  audio: { schema: { kind: "oneOf", variants: [
    selectionMode("default"), selectionMode("default-if-present"), streamSelectionMode, selectionMode("none"),
  ] } },
  spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] }, optional: true },
  picture: { schema: { kind: "oneOf", variants: [
    selectionMode("none"), selectionMode("source"),
    object({
      mode: { schema: { kind: "literal", value: "explicit" } },
      interpretation: { schema: pictureInterpretationSchema },
    }),
  ] } },
});
