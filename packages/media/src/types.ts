import type { BlobRef } from "@hypit/hypit/protocol";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap } from "@hypit/temporal";

export type MediaRational = {
  readonly numerator: number;
  readonly denominator: number;
};

/** Standardized meaning of picture samples, independent of codecs and renderers. */
export type PictureSignal = {
  readonly colorPrimaries: "bt709" | "display-p3" | "bt2020";
  readonly colorTransfer: "srgb" | "bt709" | "linear" | "pq" | "hlg";
  readonly colorMatrix: "rgb" | "bt709" | "bt2020-ncl";
  readonly colorRange: "full" | "limited";
  readonly bitDepth: 8 | 10 | 12 | 16;
};

/** Source alpha and sample interpretation shared by still and time-bearing pictures. */
export type PictureInterpretation = PictureSignal & {
  readonly alphaMode: "opaque" | "straight" | "premultiplied";
};

/** Facts observed from a source. Missing fields remain unknown until author preparation resolves them. */
export type PictureObservation = Partial<PictureInterpretation>;

/** Renderer-neutral semantics in which one visual Composition is evaluated. */
export type WorkingPictureSpec = {
  readonly colorPrimaries: PictureSignal["colorPrimaries"];
  readonly colorTransfer: "srgb" | "linear";
  readonly referenceWhiteNits: number;
  readonly alphaMode: "premultiplied";
};

/** JSON-safe presentation timestamp: ticks * timeBase.numerator / timeBase.denominator. */
export type MediaTimestamp = {
  readonly ticks: string;
  readonly timeBase: MediaRational;
};

/** Presentation order and final boundary measured from the selected video stream. */
export type VideoFrameIndex = {
  readonly timeBase: MediaRational;
  readonly timestamps: readonly string[];
  readonly endTimestamp: string;
};

export type MediaDisposition = {
  readonly default: boolean;
  readonly attachedPicture: boolean;
};

type MediaStreamBase = {
  readonly index: number;
  readonly codecType: string;
  readonly codecName: string;
  readonly disposition: MediaDisposition;
  readonly timingStatus: "admissible" | "missing" | "non-monotonic" | "discontinuous";
  readonly timeBase?: MediaRational;
  readonly startPts?: MediaTimestamp;
  readonly endPts?: MediaTimestamp;
  readonly decodedUnitCount: number;
};

export type MediaVideoStream = MediaStreamBase & {
  readonly kind: "video";
  readonly codecType: "video";
  readonly role: "moving" | "attached-picture" | "still";
  readonly width: number;
  readonly height: number;
  /** Coded-pixel width/height become display geometry only after resolving this ratio and rotation. */
  readonly sampleAspectRatio: MediaRational;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly averageFrameRate?: MediaRational;
  readonly nominalFrameRate?: MediaRational;
  readonly frameIndex?: VideoFrameIndex;
  readonly picture: PictureObservation;
};

export type MediaAudioStream = MediaStreamBase & {
  readonly kind: "audio";
  readonly codecType: "audio";
  readonly sampleRate: number;
  readonly channels: number;
  readonly channelLayout?: string;
  readonly decodedSampleFrames: number;
};

/** Subtitle, data, attachment and unknown streams remain visible instead of being discarded. */
export type MediaOtherStream = MediaStreamBase & {
  readonly kind: "other";
};

export type MediaStream = MediaVideoStream | MediaAudioStream | MediaOtherStream;

/** Immutable observed facts about one exact media container. */
export type MediaInspection = {
  readonly container: {
    readonly formatNames: readonly string[];
  };
  readonly streams: readonly MediaStream[];
};

export type MediaStreamSelection = {
  readonly videoStreamIndex?: number;
  readonly audioStreamIndex?: number;
  readonly spanAuthority: "video" | "audio";
  /** Complete author-resolved interpretation of the selected visual stream. */
  readonly picture?: PictureInterpretation;
};

export type PreparedVisualMember = {
  readonly frameIndex?: VideoFrameIndex;
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  /** Prepared-local to this member's source-presentation domain. */
  readonly map: TemporalMap;
  readonly interpretation: {
    readonly codedWidth: number;
    readonly codedHeight: number;
    readonly sampleAspectRatio: MediaRational;
    readonly rotationDegrees: 0 | 90 | 180 | 270;
    readonly picture: PictureInterpretation;
  };
};

export type PreparedAudioMember = {
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  /** Prepared-local to this member's source-presentation domain. */
  readonly map: TemporalMap;
  readonly interpretation: {
    readonly sampleRate: number;
    readonly channels: number;
    readonly channelLayout?: string;
  };
};

/** Signal-specific terminal facts projected from PreparedMedia for visual execution. */
export type PreparedVisualSource = {
  readonly frameIndex?: VideoFrameIndex;
  readonly source: BlobRef;
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  readonly interpretation: PreparedVisualMember["interpretation"];
};

/** Signal-specific terminal facts projected from PreparedMedia for audio execution. */
export type PreparedAudioSource = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  readonly interpretation: PreparedAudioMember["interpretation"];
};

/**
 * Information-preserving, execution-independent interpretation of one selected
 * time-bearing media source. Renderer evaluation and Film placement stay outside.
 */
export type PreparedMedia = {
  readonly source: BlobRef;
  readonly domain: LocalTemporalDomain;
  readonly visual?: PreparedVisualMember;
  readonly audio?: PreparedAudioMember;
};

/** Author-chosen identity for a PreparedMedia local temporal domain. */
export type MediaDomainSpec = { readonly id: string };

/** Stable picture requirements shared by encoded video and authored frame capture. */
type OutputPictureBase = {
  readonly bitDepth: PictureSignal["bitDepth"];
  readonly alpha: {
    readonly mode: "opaque";
    /** Final background used when the composed picture still contains transparency. */
    readonly matte: string;
  };
};

export type VideoOutputPictureSpec = OutputPictureBase & {
  readonly colorPrimaries: PictureSignal["colorPrimaries"];
  readonly colorTransfer: Exclude<PictureSignal["colorTransfer"], "srgb" | "linear">;
  readonly colorMatrix: Exclude<PictureSignal["colorMatrix"], "rgb">;
  readonly colorRange: "limited";
};

export type FrameOutputPictureSpec = OutputPictureBase & {
  readonly colorPrimaries: "bt709" | "display-p3";
  readonly colorTransfer: "srgb" | "linear";
  readonly colorMatrix: "rgb";
  readonly colorRange: "full";
};

export type OutputPictureSpec = VideoOutputPictureSpec | FrameOutputPictureSpec;

export type Chromaticity = {
  readonly x: number;
  readonly y: number;
};

/** Author-owned static mastering and content-light metadata for one HDR10 delivery. */
export type HdrStaticMetadata = {
  readonly masteringDisplay: {
    readonly red: Chromaticity;
    readonly green: Chromaticity;
    readonly blue: Chromaticity;
    readonly whitePoint: Chromaticity;
    readonly minLuminanceNits: number;
    readonly maxLuminanceNits: number;
  };
  readonly contentLight: {
    readonly maxContentLightLevelNits: number;
    readonly maxFrameAverageLightLevelNits: number;
  };
};

/** Stable picture and coded-video requirements, independent of any encoder implementation. */
export type VisualDeliverySpec = {
  readonly picture: VideoOutputPictureSpec;
  /** Required for PQ delivery; absent from SDR and HLG delivery. */
  readonly hdrStaticMetadata?: HdrStaticMetadata;
  readonly encoding: {
    readonly codec: "h264" | "hevc";
    readonly pixelFormat: "yuv420p" | "yuv420p10le" | "yuv420p12le";
    /** Author-visible delivery target; encoder flags remain Provider policy. */
    readonly quality: "draft" | "standard" | "high";
  };
};

/** One author-owned terminal delivery requirement shared by visual rendering and mux. */
export type MediaDeliverySpec = {
  readonly visual: VisualDeliverySpec;
  readonly audio: {
    readonly codec: "aac";
    readonly sampleRate: 48_000;
    readonly channelLayout: "stereo";
  };
  readonly container: "mp4";
};

/** Silent, frame-exact visual output produced from a timeline composition. */
export type TimelineVisual = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  /** The visual delivery requirement implemented by this encoded result. */
  readonly delivery: VisualDeliverySpec;
  readonly artifact: BlobRef;
};

/** Exact 48 kHz stereo PCM result of one explicit AudioProgram. */
export type TimelineAudio = {
  readonly artifact: BlobRef;
  readonly sampleRate: 48_000;
  readonly channelLayout: "stereo";
  readonly sampleFrames: number;
};

/** Final mux result; visual rendering and program-audio preparation remain separate facts. */
export type MuxedMedia = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly presentationSampleFrames: number;
  readonly delivery: MediaDeliverySpec;
  readonly artifact: BlobRef;
};
