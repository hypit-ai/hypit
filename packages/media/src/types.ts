import type { BlobRef } from "@narratage/protocol";

export type MediaRational = {
  readonly numerator: number;
  readonly denominator: number;
};

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
  /** Coded-pixel width/height become display geometry only after this ratio and rotation are normalized. */
  readonly sampleAspectRatio: MediaRational;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly averageFrameRate?: MediaRational;
  readonly nominalFrameRate?: MediaRational;
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

/** Immutable observed facts about one exact content-addressed container. */
export type MediaInspection = {
  readonly contract: "svml.media-inspection@1";
  readonly container: {
    readonly formatNames: readonly string[];
  };
  readonly streams: readonly MediaStream[];
};

export type MediaStreamSelection = {
  readonly contract: "svml.media-stream-selection@1";
  readonly videoStreamIndex?: number;
  readonly audioStreamIndex?: number;
  readonly spanAuthority: "video" | "audio";
  readonly policy:
    | "primary-moving@1"
    | "default-audio@1"
    | "primary-moving-default-audio@1"
    | "explicit-streams@1";
};

export type SynchronizedMedia = {
  readonly contract: "svml.synchronized-media@1";
  readonly timeline: {
    readonly frameRate: MediaRational;
    readonly frameCount: number;
  };
  readonly visual?: {
    readonly artifact: BlobRef;
    readonly width: number;
    readonly height: number;
  };
  readonly audio?: {
    readonly artifact: BlobRef;
  };
};

/** Silent, frame-exact visual output from a renderer such as HyperFrames. */
export type RenderedVisual = {
  readonly contract: "svml.rendered-visual@1";
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly artifact: BlobRef;
};

/** Exact 48 kHz stereo PCM result of one explicit timeline-audio plan. */
export type TimelineAudio = {
  readonly contract: "svml.timeline-audio@1";
  readonly artifact: BlobRef;
  readonly sampleFrames: number;
};

/** Final mux result; visual rendering and program-audio preparation remain separate facts. */
export type MuxedMedia = {
  readonly contract: "svml.muxed-media@1";
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly presentationSampleFrames: number;
  readonly artifact: BlobRef;
};
