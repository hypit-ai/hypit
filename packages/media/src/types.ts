import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap } from "@hypit/temporal/algebra";

export type MediaRational = {
  readonly numerator: number;
  readonly denominator: number;
};

export type MediaTimestamp = {
  readonly ticks: string;
  readonly timeBase: MediaRational;
};

export type PictureObservation = Partial<{
  readonly colorPrimaries: "bt709";
  readonly colorTransfer: "srgb" | "bt709";
  readonly colorMatrix: "rgb" | "bt709";
  readonly colorRange: "full" | "limited";
  readonly bitDepth: 8;
  readonly alphaMode: "opaque" | "straight" | "premultiplied";
}>;

export type PictureInterpretation =
  | {
      readonly colorPrimaries: "bt709";
      readonly colorTransfer: "srgb";
      readonly colorMatrix: "rgb";
      readonly colorRange: "full";
      readonly bitDepth: 8;
      readonly alphaMode: "opaque" | "straight";
    }
  | {
      readonly colorPrimaries: "bt709";
      readonly colorTransfer: "bt709";
      readonly colorMatrix: "bt709";
      readonly colorRange: "limited";
      readonly bitDepth: 8;
      readonly alphaMode: "opaque" | "straight";
    };

export type MediaDisposition = {
  readonly default: boolean;
  readonly attachedPicture: boolean;
};

type MediaStreamBase = {
  readonly index: number;
  readonly codecName: string;
  readonly disposition: MediaDisposition;
  readonly startPts?: MediaTimestamp;
  readonly endPts?: MediaTimestamp;
};

export type MediaPictureStream = MediaStreamBase & {
  readonly kind: "picture";
  readonly decodedUnitCount: number;
  readonly width: number;
  readonly height: number;
  readonly sampleAspectRatio: MediaRational;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly averageFrameRate?: MediaRational;
  readonly picture: PictureObservation;
};

export type MediaAudioStream = MediaStreamBase & {
  readonly kind: "audio";
  readonly sampleRate: number;
  readonly channels: number;
  readonly decodedSampleFrames: number;
};

export type MediaOtherStream = MediaStreamBase & {
  readonly kind: "other";
  readonly codecType: string;
};

export type MediaStream = MediaPictureStream | MediaAudioStream | MediaOtherStream;

export type MediaInspection = {
  readonly streams: readonly MediaStream[];
};

export type MediaPictureSelector =
  | { readonly mode: "primary-moving" }
  | { readonly mode: "primary-picture" }
  | { readonly mode: "stream-index"; readonly streamIndex: number }
  | { readonly mode: "none" };

export type MediaAudioSelector =
  | { readonly mode: "default" }
  | { readonly mode: "default-if-present" }
  | { readonly mode: "stream-index"; readonly streamIndex: number }
  | { readonly mode: "none" };

export type MediaSelectionRequest = {
  readonly picture: MediaPictureSelector;
  readonly audio: MediaAudioSelector;
  readonly domainAuthority?: "picture" | "audio";
  readonly pictureInterpretation:
    | { readonly mode: "none" }
    | { readonly mode: "source" }
    | { readonly mode: "explicit"; readonly interpretation: PictureInterpretation };
};

export type MediaStreamSelection = {
  readonly pictureStreamIndex?: number;
  readonly audioStreamIndex?: number;
  readonly domainAuthority?: "picture" | "audio";
  readonly pictureInterpretation?: PictureInterpretation;
};

type InterpretedPicture = {
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly sampleAspectRatio: MediaRational;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly picture: PictureInterpretation;
};

export type ConstantPictureMember = {
  readonly kind: "constant";
  readonly streamIndex: number;
  readonly interpretation: InterpretedPicture;
};

export type SignalPictureMember = {
  readonly kind: "signal";
  readonly streamIndex: number;
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  readonly map: TemporalMap;
  readonly interpretation: InterpretedPicture;
};

export type AudioMember = {
  readonly streamIndex: number;
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  readonly map: TemporalMap;
};

export type MediaInterpretation = {
  readonly domain?: LocalTemporalDomain;
  readonly picture?: ConstantPictureMember | SignalPictureMember;
  readonly audio?: AudioMember;
};

/** Invocation-local address supplied by the resolving Host. */
export type MediaResource = {
  readonly address: string;
  readonly mediaType: string;
  readonly size?: number;
};

export type ResolvedMedia = {
  readonly resource: MediaResource;
  readonly interpretation: MediaInterpretation;
};
