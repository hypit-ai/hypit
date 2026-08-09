import { digestOf, isDigest } from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";

import {
  assertVisualStyleV1,
  VISUAL_IR_V1,
} from "@narratage/visual-ir";
import {
  assertProgramSpaceIdentity,
  programSpaceFrameCount,
  programSpaceSampleFrames,
} from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertCompositableSurfaceRef, assertFontArtifactRef } from "@narratage/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@narratage/media";

export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

/** One inline style declaration inside a Present-owned element tree. */
export type VisualStyleDeclaration = {
  readonly name: string;
  readonly value: string | number;
};

export type VisualAttribute = {
  readonly name: string;
  readonly value: string;
};

export type VisualEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * A frame-exact, code-free animation owned by one element. Keyframe offsets
 * are relative to the containing Present and therefore remain deterministic
 * under local and hosted rendering.
 */
export type VisualKeyframe = {
  readonly atFrame: number;
  readonly easing?: VisualEasing;
  readonly style: readonly VisualStyleDeclaration[];
};

export type VisualAnimation = {
  readonly keyframes: readonly VisualKeyframe[];
};

type VisualElementBase = {
  readonly id: string;
  readonly parent?: string;
  readonly order: number;
  readonly style: readonly VisualStyleDeclaration[];
  readonly attributes?: readonly VisualAttribute[];
  readonly animation?: VisualAnimation;
};

export type VisualBoxElement = VisualElementBase & {
  readonly kind: "box";
};

export type VisualTextElement = VisualElementBase & {
  readonly kind: "text";
  readonly text: string;
  /** Exact ordered fallback faces. Omission remains a candidate-era, environment-bound path. */
  readonly fonts?: readonly FontArtifactRef[];
};

export type VisualSamplingRational = {
  readonly numerator: number;
  readonly denominator: number;
};

/**
 * One exact piece of a timed visual's source-time function. Target frames are
 * relative to the containing Present. A gap means the material is invisible.
 */
export type VisualSamplingSegment = {
  readonly target: FrameSpan;
  /** Absolute source-frame position at target.startFrame. */
  readonly sourceFrame: VisualSamplingRational;
  /** Source frames advanced per Program frame; zero is an exact held frame. */
  readonly rate: VisualSamplingRational;
  readonly loop?: FrameSpan;
};

export type VisualTimedSampling = {
  readonly sourceFrameRate: VisualSamplingRational;
  readonly sourceFrameCount: number;
  readonly segments: readonly VisualSamplingSegment[];
};

export type VisualMediaElement = VisualElementBase & {
  readonly kind: "image" | "video";
  readonly artifact: BlobRef;
  /** Exact frame-domain mapping superseding the candidate-era scalar playback fields. */
  readonly sampling?: VisualTimedSampling;
  /** Candidate-era compatibility path; new timed lowerers use sampling. */
  readonly mediaStartSec?: number;
  readonly playbackRate?: number;
  readonly loop?: boolean;
  readonly muted?: boolean;
};

/** A package-materialized visual surface with content-bound compositing metadata, not an untyped media guess. */
export type VisualSurfaceElement = VisualElementBase & {
  readonly kind: "surface";
  readonly surface: CompositableSurfaceRef;
  readonly sampling?: VisualTimedSampling;
};

/**
 * Deliberately small, code-free renderer-neutral visual primitives.
 *
 * Elements may reference only parents in the same Present. They have no selector,
 * script, sibling Track id or accumulated-composite input.
 */
export type VisualElement = VisualBoxElement | VisualTextElement | VisualMediaElement | VisualSurfaceElement;

export type VisualPresent = {
  readonly id: string;
  readonly span: FrameSpan;
  /** Absolute paint position for this Present, not for its authoring Track. */
  readonly stacking: {
    readonly order: number;
    readonly tieBreak: string;
  };
  readonly elements: readonly VisualElement[];
};

export type VisualTrack = {
  readonly contract: "svml.visual-track@1";
  /** The one terminal visual language shared by official video components. */
  readonly visualIr: typeof VISUAL_IR_V1;
  readonly id: string;
  /** Author-owned contributions that Composition may interleave by absolute z. */
  readonly presents: readonly VisualPresent[];
};

export type AudioClip = {
  readonly id: string;
  /** Bytes only. Exact duration belongs to source.sampleFrames, not duplicated floating metadata. */
  readonly artifact: BlobRef;
  /** Exact audible placement in the canonical 48 kHz ProgramSpace sample domain. */
  readonly target: {
    readonly startSample: number;
    readonly endSampleExclusive: number;
  };
  /** Exact sampling interval in one canonical 48 kHz stereo WAV Artifact. */
  readonly source: {
    readonly sampleFrames: number;
    readonly startSample: number;
    readonly endSampleExclusive: number;
    readonly loop: boolean;
    /** Offset inside the effective source interval used only when looping. */
    readonly phaseSample: number;
  };
  readonly playbackRate: number;
  readonly pitch: "preserve";
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

export type AudioTrack = {
  readonly contract: "svml.audio-track@1";
  readonly id: string;
  readonly clips: readonly AudioClip[];
};

export type Track = VisualTrack | AudioTrack;

export type Composition = {
  readonly contract: "svml.composition@1";
  readonly id: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    /** Structural clear color beneath every VisualTrack. */
    readonly clearColor: string;
  };
  readonly tracks: readonly Track[];
};

const ANIMATABLE_LOCAL_STYLES = new Set([
  "clip-path",
  "filter",
  "opacity",
  "transform",
]);

function assertNonEmpty(value: string, label: string): void {
  if (!value) throw new Error(`${label} must not be empty.`);
}

function assertFrameSpan(span: FrameSpan, totalFrames: number, label: string): void {
  if (
    !Number.isSafeInteger(span.startFrame)
    || !Number.isSafeInteger(span.endFrameExclusive)
    || span.startFrame < 0
    || span.endFrameExclusive <= span.startFrame
    || span.endFrameExclusive > totalFrames
  ) {
    throw new Error(`${label} is outside ProgramSpace.`);
  }
}

function assertMediaArtifact(artifact: BlobRef, label: string): void {
  if (
    artifact.kind !== "blob"
    || !isDigest(artifact.digest)
    || !Number.isSafeInteger(artifact.size)
    || artifact.size < 0
    || !artifact.mediaType
  ) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertRational(value: VisualSamplingRational, label: string, allowZero: boolean): void {
  if (!Number.isSafeInteger(value.numerator) || (!allowZero && value.numerator <= 0) || (allowZero && value.numerator < 0)
    || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
    throw new Error(`${label} must be a non-negative safe rational.`);
  }
}

function compareRationalToInteger(value: VisualSamplingRational, integer: number): number {
  const difference = BigInt(value.numerator) - BigInt(integer) * BigInt(value.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function sourceAt(segment: VisualSamplingSegment, targetOffset: number): VisualSamplingRational {
  const denominator = BigInt(segment.sourceFrame.denominator) * BigInt(segment.rate.denominator);
  const numerator = BigInt(segment.sourceFrame.numerator) * BigInt(segment.rate.denominator)
    + BigInt(targetOffset) * BigInt(segment.rate.numerator) * BigInt(segment.sourceFrame.denominator);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Visual sampling arithmetic exceeds the safe wire domain.");
  }
  return { numerator: Number(numerator), denominator: Number(denominator) };
}

function assertSampling(value: VisualTimedSampling, durationFrames: number, label: string): void {
  assertRational(value.sourceFrameRate, `${label}.sourceFrameRate`, false);
  if (!Number.isSafeInteger(value.sourceFrameCount) || value.sourceFrameCount <= 0 || value.segments.length === 0) {
    throw new Error(`${label} source frame domain is invalid.`);
  }
  let previousEnd = 0;
  for (const [index, segment] of value.segments.entries()) {
    const item = `${label}.segments.${index}`;
    if (!Number.isSafeInteger(segment.target.startFrame) || !Number.isSafeInteger(segment.target.endFrameExclusive)
      || segment.target.startFrame < previousEnd || segment.target.endFrameExclusive <= segment.target.startFrame
      || segment.target.endFrameExclusive > durationFrames) throw new Error(`${item} target interval is invalid.`);
    assertRational(segment.sourceFrame, `${item}.sourceFrame`, true);
    assertRational(segment.rate, `${item}.rate`, true);
    if (segment.loop !== undefined) {
      if (!Number.isSafeInteger(segment.loop.startFrame) || !Number.isSafeInteger(segment.loop.endFrameExclusive)
        || segment.loop.startFrame < 0 || segment.loop.endFrameExclusive <= segment.loop.startFrame
        || segment.loop.endFrameExclusive > value.sourceFrameCount
        || compareRationalToInteger(segment.sourceFrame, segment.loop.startFrame) < 0
        || compareRationalToInteger(segment.sourceFrame, segment.loop.endFrameExclusive) >= 0) {
        throw new Error(`${item} loop interval or phase is invalid.`);
      }
    } else {
      const last = sourceAt(segment, segment.target.endFrameExclusive - segment.target.startFrame - 1);
      if (compareRationalToInteger(segment.sourceFrame, 0) < 0
        || compareRationalToInteger(segment.sourceFrame, value.sourceFrameCount) >= 0
        || compareRationalToInteger(last, 0) < 0
        || compareRationalToInteger(last, value.sourceFrameCount) >= 0) {
        throw new Error(`${item} samples outside its source frame domain.`);
      }
    }
    previousEnd = segment.target.endFrameExclusive;
  }
}

function assertAudioArtifact(artifact: BlobRef, label: string): void {
  if (
    artifact.kind !== "blob"
    || !isDigest(artifact.digest)
    || !Number.isSafeInteger(artifact.size)
    || artifact.size < 0
    || artifact.mediaType !== "audio/wav"
  ) {
    throw new Error(`${label} must be a canonical WAV BlobRef.`);
  }
}

function assertStyle(style: readonly VisualStyleDeclaration[], label: string): void {
  const names = new Set<string>();
  for (const declaration of style) {
    if (names.has(declaration.name)) {
      throw new Error(`${label} contains duplicate style ${declaration.name}.`);
    }
    names.add(declaration.name);
    assertVisualStyleV1(declaration.name, declaration.value, label);
  }
}

function assertAttributes(attributes: readonly VisualAttribute[] | undefined, label: string): void {
  const names = new Set<string>();
  for (const attribute of attributes ?? []) {
    if (!/^(?:data-[a-z0-9-]+|aria-[a-z0-9-]+|role|title)$/u.test(attribute.name)) {
      throw new Error(`${label} contains unsafe attribute ${attribute.name}.`);
    }
    if (names.has(attribute.name)) {
      throw new Error(`${label} contains duplicate attribute ${attribute.name}.`);
    }
    names.add(attribute.name);
  }
}

function assertAnimation(animation: VisualAnimation | undefined, durationFrames: number, label: string): void {
  if (animation === undefined) return;
  if (animation.keyframes.length < 2) throw new Error(`${label} animation must contain at least two keyframes.`);
  let previous = -1;
  for (const [index, keyframe] of animation.keyframes.entries()) {
    if (
      !Number.isSafeInteger(keyframe.atFrame)
      || keyframe.atFrame < 0
      || keyframe.atFrame > durationFrames
      || keyframe.atFrame <= previous
    ) {
      throw new Error(`${label} animation keyframe ${index + 1} has an invalid frame offset.`);
    }
    if (
      keyframe.easing !== undefined
      && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(keyframe.easing)
    ) {
      throw new Error(`${label} animation keyframe ${index + 1} has an invalid easing.`);
    }
    if (keyframe.style.length === 0) throw new Error(`${label} animation keyframe ${index + 1} has no style.`);
    assertStyle(keyframe.style, `${label}.animation.${index + 1}`);
    for (const declaration of keyframe.style) {
      if (!ANIMATABLE_LOCAL_STYLES.has(declaration.name)) {
        throw new Error(`${label} animation cannot change ${declaration.name}.`);
      }
    }
    previous = keyframe.atFrame;
  }
  if (animation.keyframes[0]!.atFrame !== 0 || animation.keyframes.at(-1)!.atFrame !== durationFrames) {
    throw new Error(`${label} animation must cover the complete Present span.`);
  }
}

function assertPresent(present: VisualPresent, programSpace: ProgramSpace | undefined, trackId: string): void {
  const totalFrames = programSpace === undefined ? Number.MAX_SAFE_INTEGER : programSpaceFrameCount(programSpace);
  assertNonEmpty(present.id, `${trackId} Present id`);
  assertFrameSpan(present.span, totalFrames, `${trackId}.${present.id}.span`);
  assertNonEmpty(present.stacking.tieBreak, `${trackId}.${present.id} stacking tieBreak`);
  if (!Number.isSafeInteger(present.stacking.order)) {
    throw new Error(`${trackId}.${present.id} has invalid stacking order.`);
  }
  if (present.elements.length === 0) throw new Error(`${trackId}.${present.id} must contain an element.`);
  const elements = new Map<string, VisualElement>();
  const roots: VisualElement[] = [];
  const orders = new Set<number>();
  for (const element of present.elements) {
    assertNonEmpty(element.id, `${trackId}.${present.id} element id`);
    if (elements.has(element.id)) throw new Error(`${trackId}.${present.id} has duplicate element ${element.id}.`);
    if (!Number.isSafeInteger(element.order) || element.order < 0 || orders.has(element.order)) {
      throw new Error(`${trackId}.${present.id}.${element.id} has invalid or duplicate order.`);
    }
    orders.add(element.order);
    elements.set(element.id, element);
    if (element.parent === undefined) roots.push(element);
    assertStyle(element.style, `${trackId}.${present.id}.${element.id}`);
    assertAttributes(element.attributes, `${trackId}.${present.id}.${element.id}`);
    assertAnimation(
      element.animation,
      present.span.endFrameExclusive - present.span.startFrame,
      `${trackId}.${present.id}.${element.id}`,
    );
    if (element.kind === "image" || element.kind === "video") {
      assertMediaArtifact(element.artifact, `${trackId}.${present.id}.${element.id}.artifact`);
      if (!element.artifact.mediaType.startsWith(`${element.kind}/`)) {
        throw new Error(`${trackId}.${present.id}.${element.id} media kind does not match its Artifact.`);
      }
      if (element.mediaStartSec !== undefined && (!Number.isFinite(element.mediaStartSec) || element.mediaStartSec < 0)) {
        throw new Error(`${trackId}.${present.id}.${element.id} has invalid mediaStartSec.`);
      }
      if (element.playbackRate !== undefined && (!Number.isFinite(element.playbackRate) || element.playbackRate <= 0)) {
        throw new Error(`${trackId}.${present.id}.${element.id} has invalid playbackRate.`);
      }
      if (element.kind === "image" && element.sampling !== undefined) {
        throw new Error(`${trackId}.${present.id}.${element.id} cannot sample a durationless image.`);
      }
      if (element.sampling !== undefined) {
        if (element.mediaStartSec !== undefined || element.playbackRate !== undefined || element.loop !== undefined) {
          throw new Error(`${trackId}.${present.id}.${element.id} mixes exact sampling with scalar playback fields.`);
        }
        if (element.animation !== undefined) {
          throw new Error(`${trackId}.${present.id}.${element.id} sampling motion must live on an owned wrapper.`);
        }
        assertSampling(element.sampling, present.span.endFrameExclusive - present.span.startFrame,
          `${trackId}.${present.id}.${element.id}.sampling`);
      }
    }
    if (element.kind === "text" && element.fonts !== undefined) {
      if (element.fonts.length === 0) throw new Error(`${trackId}.${present.id}.${element.id} has an empty font stack.`);
      const faces = new Set<string>();
      for (const [index, font] of element.fonts.entries()) {
        assertFontArtifactRef(font, `${trackId}.${present.id}.${element.id}.fonts.${index}`);
        const face = digestOf(font);
        if (faces.has(face)) throw new Error(`${trackId}.${present.id}.${element.id} has a duplicate font face.`);
        faces.add(face);
      }
      const ownedFontStyles = new Set(["font", "font-family", "font-style", "font-synthesis", "font-weight"]);
      if (element.style.some((declaration) => ownedFontStyles.has(declaration.name))) {
        throw new Error(`${trackId}.${present.id}.${element.id} exact fonts conflict with a raw font style.`);
      }
    }
    if (element.kind === "surface") {
      assertCompositableSurfaceRef(element.surface, `${trackId}.${present.id}.${element.id}.surface`);
      if (element.surface.timing.kind === "still" && element.sampling !== undefined) {
        throw new Error(`${trackId}.${present.id}.${element.id} cannot sample a still Surface.`);
      }
      if (element.sampling !== undefined) {
        if (element.animation !== undefined) {
          throw new Error(`${trackId}.${present.id}.${element.id} sampling motion must live on an owned wrapper.`);
        }
        if (element.surface.timing.kind !== "frames"
          || element.sampling.sourceFrameCount !== element.surface.timing.frameCount
          || element.sampling.sourceFrameRate.numerator !== element.surface.timing.frameRate.numerator
          || element.sampling.sourceFrameRate.denominator !== element.surface.timing.frameRate.denominator) {
          throw new Error(`${trackId}.${present.id}.${element.id} Surface sampling differs from its typed timing.`);
        }
        assertSampling(element.sampling, present.span.endFrameExclusive - present.span.startFrame,
          `${trackId}.${present.id}.${element.id}.sampling`);
      }
      if (element.surface.timing.kind === "frames") {
        const durationFrames = present.span.endFrameExclusive - present.span.startFrame;
        if (element.sampling === undefined && element.surface.timing.frameCount !== durationFrames) {
          throw new Error(`${trackId}.${present.id}.${element.id} Surface must exactly match its Present frame domain.`);
        }
        if (element.sampling === undefined && programSpace !== undefined && (
          element.surface.timing.frameRate.numerator !== programSpace.frameRate.numerator
          || element.surface.timing.frameRate.denominator !== programSpace.frameRate.denominator
        )) throw new Error(`${trackId}.${present.id}.${element.id} Surface must exactly match its Present frame domain.`);
      }
    }
  }
  if (roots.length !== 1) throw new Error(`${trackId}.${present.id} must contain exactly one root element.`);
  for (const element of present.elements) {
    if (element.parent !== undefined && !elements.has(element.parent)) {
      throw new Error(`${trackId}.${present.id}.${element.id} references a foreign parent.`);
    }
    if (element.parent !== undefined && elements.get(element.parent)?.kind !== "box") {
      throw new Error(`${trackId}.${present.id}.${element.id} must have a box parent.`);
    }
    const visited = new Set<string>();
    let cursor: VisualElement | undefined = element;
    while (cursor?.parent !== undefined) {
      if (visited.has(cursor.id)) throw new Error(`${trackId}.${present.id} contains an element cycle.`);
      visited.add(cursor.id);
      cursor = elements.get(cursor.parent);
    }
  }
}

function normalizeStyle(style: readonly VisualStyleDeclaration[]): VisualStyleDeclaration[] {
  return [...style]
    .map((item) => ({ name: item.name, value: item.value }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeAttributes(attributes: readonly VisualAttribute[]): readonly VisualAttribute[] {
  return [...attributes]
    .map((item) => ({ name: item.name, value: item.value }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeAnimation(animation: VisualAnimation): VisualAnimation {
  return {
    keyframes: [...animation.keyframes]
      .map((keyframe) => ({
        atFrame: keyframe.atFrame,
        ...(keyframe.easing === undefined ? {} : { easing: keyframe.easing }),
        style: normalizeStyle(keyframe.style),
      }))
      .sort((left, right) => left.atFrame - right.atFrame),
  };
}

function normalizeElement(element: VisualElement): VisualElement {
  const common = {
    id: element.id,
    ...(element.parent === undefined ? {} : { parent: element.parent }),
    order: element.order,
    style: normalizeStyle(element.style),
    ...(element.attributes === undefined ? {} : { attributes: normalizeAttributes(element.attributes) }),
    ...(element.animation === undefined ? {} : { animation: normalizeAnimation(element.animation) }),
  };
  if (element.kind === "box") return { ...common, kind: "box" };
  if (element.kind === "text") {
    return {
      ...common,
      kind: "text",
      text: element.text,
      ...(element.fonts === undefined ? {} : {
        fonts: element.fonts.map((font) => ({
          contract: font.contract,
          sources: font.sources.map((source) => ({
            artifact: { ...source.artifact },
            ...(source.unicodeRange === undefined ? {} : { unicodeRange: source.unicodeRange }),
          })),
          weight: font.weight,
          style: font.style,
        })),
      }),
    };
  }
  if (element.kind === "surface") {
    return {
      ...common,
      kind: "surface",
      surface: {
        ...element.surface,
        artifact: { ...element.surface.artifact },
        timing: element.surface.timing.kind === "still"
          ? { kind: "still" }
          : { ...element.surface.timing, frameRate: { ...element.surface.timing.frameRate } },
      },
      ...(element.sampling === undefined ? {} : { sampling: {
        sourceFrameRate: { ...element.sampling.sourceFrameRate },
        sourceFrameCount: element.sampling.sourceFrameCount,
        segments: element.sampling.segments.map((segment) => ({
          target: { ...segment.target }, sourceFrame: { ...segment.sourceFrame }, rate: { ...segment.rate },
          ...(segment.loop === undefined ? {} : { loop: { ...segment.loop } }),
        })),
      } }),
    };
  }
  return {
    ...common,
    kind: element.kind,
    artifact: { ...element.artifact },
    ...(element.sampling === undefined ? {} : { sampling: {
      sourceFrameRate: { ...element.sampling.sourceFrameRate },
      sourceFrameCount: element.sampling.sourceFrameCount,
      segments: element.sampling.segments.map((segment) => ({
        target: { ...segment.target }, sourceFrame: { ...segment.sourceFrame }, rate: { ...segment.rate },
        ...(segment.loop === undefined ? {} : { loop: { ...segment.loop } }),
      })),
    } }),
    ...(element.mediaStartSec === undefined ? {} : { mediaStartSec: element.mediaStartSec }),
    ...(element.playbackRate === undefined ? {} : { playbackRate: element.playbackRate }),
    ...(element.loop === undefined ? {} : { loop: element.loop }),
    ...(element.muted === undefined ? {} : { muted: element.muted }),
  };
}

function visualTrackContent(value: VisualTrack): VisualTrack {
  return {
    contract: "svml.visual-track@1",
    visualIr: value.visualIr,
    id: value.id,
    presents: [...value.presents]
      .map((present) => ({
        id: present.id,
        span: { ...present.span },
        stacking: { ...present.stacking },
        elements: [...present.elements].map(normalizeElement).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.span.startFrame - b.span.startFrame
        || a.stacking.order - b.stacking.order
        || a.stacking.tieBreak.localeCompare(b.stacking.tieBreak)
        || a.id.localeCompare(b.id)),
  };
}

function audioTrackContent(value: AudioTrack): AudioTrack {
  return {
    contract: "svml.audio-track@1",
    id: value.id,
    clips: [...value.clips]
      .map((clip) => ({
        id: clip.id,
        artifact: { ...clip.artifact },
        target: { ...clip.target },
        source: { ...clip.source },
        playbackRate: clip.playbackRate,
        pitch: clip.pitch,
        gain: clip.gain,
        fadeInSamples: clip.fadeInSamples,
        fadeOutSamples: clip.fadeOutSamples,
      }))
      .sort((a, b) => a.target.startSample - b.target.startSample || a.id.localeCompare(b.id)),
  };
}

export function sealVisualTrack(value: VisualTrack): VisualTrack {
  return visualTrackContent(value);
}

export function sealAudioTrack(value: AudioTrack): AudioTrack {
  return audioTrackContent(value);
}

export function assertVisualTrackIdentity(track: VisualTrack, programSpace?: ProgramSpace): void {
  if (programSpace !== undefined) assertProgramSpaceIdentity(programSpace);
  if (track.contract !== "svml.visual-track@1") throw new Error("Unsupported VisualTrack contract.");
  if (track.visualIr !== VISUAL_IR_V1) throw new Error("Unsupported VisualTrack visual IR.");
  assertNonEmpty(track.id, "VisualTrack id");
  const presentIds = new Set<string>();
  for (const present of track.presents) {
    if (presentIds.has(present.id)) throw new Error(`${track.id} has duplicate Present ${present.id}.`);
    presentIds.add(present.id);
    assertPresent(present, programSpace, track.id);
  }
}

export function assertAudioTrackIdentity(track: AudioTrack, programSpace?: ProgramSpace): void {
  if (programSpace !== undefined) assertProgramSpaceIdentity(programSpace);
  if (track.contract !== "svml.audio-track@1") throw new Error("Unsupported AudioTrack contract.");
  assertNonEmpty(track.id, "AudioTrack id");
  const totalSamples = programSpace === undefined
    ? Number.MAX_SAFE_INTEGER
    : programSpaceSampleFrames(programSpace, 48_000);
  const clipIds = new Set<string>();
  for (const clip of track.clips) {
    if (clipIds.has(clip.id)) throw new Error(`${track.id} has duplicate clip ${clip.id}.`);
    clipIds.add(clip.id);
    assertNonEmpty(clip.id, `${track.id} clip id`);
    assertAudioArtifact(clip.artifact, `${track.id}.${clip.id}.artifact`);
    if (!Number.isSafeInteger(clip.target.startSample) || clip.target.startSample < 0
      || !Number.isSafeInteger(clip.target.endSampleExclusive)
      || clip.target.endSampleExclusive <= clip.target.startSample
      || clip.target.endSampleExclusive > totalSamples) {
      throw new Error(`${track.id}.${clip.id} target sample interval is outside ProgramSpace.`);
    }
    if (!Number.isSafeInteger(clip.source.sampleFrames) || clip.source.sampleFrames <= 0
      || !Number.isSafeInteger(clip.source.startSample) || clip.source.startSample < 0
      || !Number.isSafeInteger(clip.source.endSampleExclusive)
      || clip.source.endSampleExclusive <= clip.source.startSample
      || clip.source.endSampleExclusive > clip.source.sampleFrames) {
      throw new Error(`${track.id}.${clip.id} source sample interval is invalid.`);
    }
    const sourceLength = clip.source.endSampleExclusive - clip.source.startSample;
    if (!Number.isSafeInteger(clip.source.phaseSample) || clip.source.phaseSample < 0
      || clip.source.phaseSample >= sourceLength
      || (!clip.source.loop && clip.source.phaseSample !== 0)) {
      throw new Error(`${track.id}.${clip.id} source loop phase is invalid.`);
    }
    if (!Number.isFinite(clip.playbackRate) || clip.playbackRate <= 0 || clip.playbackRate > 100) {
      throw new Error(`${track.id}.${clip.id} has invalid playbackRate.`);
    }
    if (clip.pitch !== "preserve") throw new Error(`${track.id}.${clip.id} pitch policy is invalid.`);
    if (!Number.isFinite(clip.gain) || clip.gain < 0 || clip.gain > 64) {
      throw new Error(`${track.id}.${clip.id} gain is invalid.`);
    }
    const targetLength = clip.target.endSampleExclusive - clip.target.startSample;
    if (!Number.isSafeInteger(clip.fadeInSamples) || clip.fadeInSamples < 0 || clip.fadeInSamples > targetLength
      || !Number.isSafeInteger(clip.fadeOutSamples) || clip.fadeOutSamples < 0
      || clip.fadeOutSamples > targetLength) {
      throw new Error(`${track.id}.${clip.id} fades are invalid.`);
    }
  }
}

function trackKey(track: Track): string {
  return `${track.contract}\u0000${track.id}`;
}

function compositionContent(value: Composition): Composition {
  return {
    contract: "svml.composition@1",
    id: value.id,
    canvas: { ...value.canvas },
    tracks: [...value.tracks].map((track) => structuredClone(track)).sort((a, b) => trackKey(a).localeCompare(trackKey(b))),
  };
}

export function sealComposition(value: Composition): Composition {
  return compositionContent(value);
}

export function assertCompositionIdentity(composition: Composition, programSpace?: ProgramSpace): void {
  if (composition.contract !== "svml.composition@1") throw new Error("Unsupported Composition contract.");
  assertNonEmpty(composition.id, "Composition id");
  if (programSpace !== undefined) assertProgramSpaceIdentity(programSpace);
  if (
    !Number.isSafeInteger(composition.canvas.width)
    || composition.canvas.width <= 0
    || !Number.isSafeInteger(composition.canvas.height)
    || composition.canvas.height <= 0
    || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(composition.canvas.clearColor)
  ) {
    throw new Error("Composition canvas is invalid.");
  }
  const ids = new Set<string>();
  const stacking = new Map<string, Array<{ readonly trackId: string; readonly present: VisualPresent }>>();
  for (const track of composition.tracks) {
    if (ids.has(track.id)) throw new Error(`Composition contains duplicate Track id ${track.id}.`);
    ids.add(track.id);
    if (track.contract === "svml.visual-track@1") {
      assertVisualTrackIdentity(track, programSpace);
      for (const present of track.presents) {
        const key = `${present.stacking.order}\u0000${present.stacking.tieBreak}`;
        const peers = stacking.get(key) ?? [];
        for (const peer of peers) {
          const overlaps = present.span.startFrame < peer.present.span.endFrameExclusive
            && peer.present.span.startFrame < present.span.endFrameExclusive;
          if (overlaps) {
            throw new Error(
              `Composition contains overlapping visual stacking key ${key} in ${peer.trackId}.${peer.present.id} and ${track.id}.${present.id}.`,
            );
          }
        }
        peers.push({ trackId: track.id, present });
        stacking.set(key, peers);
      }
    } else {
      assertAudioTrackIdentity(track, programSpace);
    }
  }
}
