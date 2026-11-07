import type { BlobRef } from "@hypit/protocol";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap } from "@hypit/temporal/algebra";

export type MediaRational = {
  readonly numerator: number;
  readonly denominator: number;
};

/** Picture facts reported by inspection for the supported picture families. */
export type PictureObservationSignal = {
  readonly colorPrimaries: "bt709";
  readonly colorTransfer: "srgb" | "bt709";
  readonly colorMatrix: "rgb" | "bt709";
  readonly colorRange: "full" | "limited";
  readonly bitDepth: 8;
};

/** The complete SDR source interpretations implemented by the current preparation and render paths. */
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

export type MediaVideoSelector =
  | { readonly mode: "primary-moving" }
  | { readonly mode: "primary-picture" }
  | { readonly mode: "stream-index"; readonly streamIndex: number }
  | { readonly mode: "none" };

export type MediaAudioSelector =
  | { readonly mode: "default" }
  | { readonly mode: "default-if-present" }
  | { readonly mode: "stream-index"; readonly streamIndex: number }
  | { readonly mode: "none" };

/** Author policy for interpreting one time-bearing Resource as PreparedMedia. */
export type MediaSelectionRequest = {
  readonly video: MediaVideoSelector;
  readonly audio: MediaAudioSelector;
  /** Required only when the selected media has a temporal signal. */
  readonly spanAuthority?: "video" | "audio";
  readonly picture:
    | { readonly mode: "none" }
    | { readonly mode: "source" }
    | { readonly mode: "explicit"; readonly interpretation: PictureInterpretation };
};

/** Runtime observation request. The Resource identity remains on the graph edge. */
export type InspectMediaNeed = {
  readonly source: BlobRef;
};

/** Selects one audio member for physical materialization as a standalone Blob. */
export type AudioExtractionRequest = {
  readonly audio: Exclude<MediaAudioSelector,
    { readonly mode: "none" } | { readonly mode: "default-if-present" }>;
};

/** Selects one decoded picture from a moving visual member. */
export type FrameExtractionRequest = {
  readonly video: Exclude<MediaVideoSelector, { readonly mode: "none" }>;
  readonly at:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "frame"; readonly index: number }
    | { readonly kind: "time"; readonly seconds: number };
};

/** Byte-level audio extraction after stream selection has been resolved. */
export type ExtractAudioNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
};

/** Byte-level frame extraction after stream selection has been resolved. */
export type ExtractFrameNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly sourceFrameCount: number;
  readonly at: FrameExtractionRequest["at"];
};

export type PictureSignal = Omit<PictureInterpretation, "alphaMode">;

/** Facts observed from a source. Missing fields remain unknown until author preparation resolves them. */
export type PictureObservation = Partial<PictureObservationSignal & {
  readonly alphaMode: "opaque" | "straight" | "premultiplied";
}>;

/** JSON-safe presentation timestamp: ticks * timeBase.numerator / timeBase.denominator. */
export type MediaTimestamp = {
  readonly ticks: string;
  readonly timeBase: MediaRational;
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

export type MediaVideoStream = MediaStreamBase & {
  readonly kind: "video";
  readonly decodedUnitCount: number;
  readonly width: number;
  readonly height: number;
  /** Coded-pixel width/height become display geometry only after resolving this ratio and rotation. */
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

/** Subtitle, data, attachment and unknown streams remain visible instead of being discarded. */
export type MediaOtherStream = MediaStreamBase & {
  readonly kind: "other";
  /** Original ffprobe stream class for streams Hypit does not interpret. */
  readonly codecType: string;
};

export type MediaStream = MediaVideoStream | MediaAudioStream | MediaOtherStream;

/** Immutable observed facts about one exact media container. */
export type MediaInspection = {
  readonly streams: readonly MediaStream[];
};

export type MediaStreamSelection = {
  readonly videoStreamIndex?: number;
  readonly audioStreamIndex?: number;
  readonly spanAuthority?: "video" | "audio";
  /** Complete author-resolved interpretation of the selected visual stream. */
  readonly picture?: PictureInterpretation;
};

type PreparedPictureInterpretation = {
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly sampleAspectRatio: MediaRational;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly picture: PictureInterpretation;
};

export type PreparedConstantPictureMember = {
  readonly kind: "constant";
  readonly streamIndex: number;
  readonly interpretation: PreparedPictureInterpretation;
};

export type PreparedSignalPictureMember = {
  readonly kind: "signal";
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  /** Prepared-local to this member's source-presentation domain. */
  readonly map: TemporalMap;
  readonly interpretation: PreparedPictureInterpretation;
};

export type PreparedPictureMember = PreparedConstantPictureMember | PreparedSignalPictureMember;

export type PreparedAudioMember = {
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
  /** Prepared-local to this member's source-presentation domain. */
  readonly map: TemporalMap;
};

export type PreparedConstantPictureSource = {
  readonly source: BlobRef;
} & PreparedConstantPictureMember;

/** Signal-specific terminal facts projected from PreparedMedia for visual execution. */
export type PreparedSignalPictureSource = {
  readonly source: BlobRef;
} & Omit<PreparedSignalPictureMember, "map">;

export type PreparedPictureSource = PreparedConstantPictureSource | PreparedSignalPictureSource;

/** Signal-specific terminal facts projected from PreparedMedia for audio execution. */
export type PreparedAudioSource = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  /** Original presentation timestamp corresponding to source-domain zero. */
  readonly presentationStart: ExactTemporalValue;
  readonly sourceDomain: LocalTemporalDomain;
};

/**
 * Information-preserving, execution-independent interpretation of one selected
 * time-bearing media source. Renderer evaluation and Film placement stay outside.
 */
export type PreparedMedia = {
  readonly id: string;
  readonly source: BlobRef;
  /** Present exactly when at least one selected facet is time-bearing. */
  readonly domain?: LocalTemporalDomain;
  readonly picture?: PreparedPictureMember;
  readonly audio?: PreparedAudioMember;
};

/** Author-chosen identity for a PreparedMedia local temporal domain. */
export type MediaDomainSpec = { readonly id: string };

/** Stable picture requirements shared by encoded video and authored frame capture. */
type OutputPictureBase = {
  readonly bitDepth: 8;
  readonly alpha: {
    readonly mode: "opaque";
    /** Final background used when the composed picture still contains transparency. */
    readonly matte: string;
  };
};

export type VideoOutputPictureSpec = OutputPictureBase & {
  readonly colorPrimaries: "bt709";
  readonly colorTransfer: "bt709";
  readonly colorMatrix: "bt709";
  readonly colorRange: "limited";
};

export type FrameOutputPictureSpec = OutputPictureBase & {
  readonly colorPrimaries: "bt709";
  readonly colorTransfer: "srgb";
  readonly colorMatrix: "rgb";
  readonly colorRange: "full";
};

export type OutputPictureSpec = VideoOutputPictureSpec | FrameOutputPictureSpec;

/** Stable picture and coded-video requirements, independent of any encoder implementation. */
export type VisualDeliverySpec = {
  readonly picture: VideoOutputPictureSpec;
  readonly encoding: {
    readonly codec: "h264";
    readonly pixelFormat: "yuv420p";
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

/** Silent, frame-exact visual product of one completed render. */
export type RenderedVisual = {
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
export type RenderedAudio = {
  readonly artifact: BlobRef;
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
  readonly delivery: MediaDeliverySpec;
  readonly artifact: BlobRef;
};
