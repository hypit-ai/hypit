import { isDigest } from "@narratage/protocol";

import {
  assertVisualStyleV1,
  VISUAL_IR_V1,
} from "@narratage/visual-ir";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertCompositableSurfaceRef, assertFontArtifactRef } from "@narratage/media";
import type { CompositableSurfaceRef, FontArtifactRef, MediaArtifactRef } from "@narratage/media";

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

export type VisualMediaElement = VisualElementBase & {
  readonly kind: "image" | "video";
  readonly artifact: MediaArtifactRef;
  readonly mediaStartSec?: number;
  readonly playbackRate?: number;
  readonly loop?: boolean;
  readonly muted?: boolean;
};

/** A package-materialized visual surface with content-bound compositing metadata, not an untyped media guess. */
export type VisualSurfaceElement = VisualElementBase & {
  readonly kind: "surface";
  readonly surface: CompositableSurfaceRef;
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
  readonly span: FrameSpan;
  readonly artifact: MediaArtifactRef;
  readonly mediaStartSec?: number;
  readonly playbackRate?: number;
  readonly gain?: number;
  readonly fadeInSec?: number;
  readonly fadeOutSec?: number;
  readonly bus?: "speech" | "music" | "sfx" | "source";
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

function assertArtifact(artifact: MediaArtifactRef, label: string): void {
  if (
    !isDigest(artifact.digest)
    || !Number.isSafeInteger(artifact.size)
    || artifact.size < 0
    || !artifact.mediaType
    || !Number.isFinite(artifact.durationSec)
    || artifact.durationSec < 0
  ) {
    throw new Error(`${label} is invalid.`);
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
      assertArtifact(element.artifact, `${trackId}.${present.id}.${element.id}.artifact`);
      if (!element.artifact.mediaType.startsWith(`${element.kind}/`)) {
        throw new Error(`${trackId}.${present.id}.${element.id} media kind does not match its Artifact.`);
      }
      if (element.mediaStartSec !== undefined && (!Number.isFinite(element.mediaStartSec) || element.mediaStartSec < 0)) {
        throw new Error(`${trackId}.${present.id}.${element.id} has invalid mediaStartSec.`);
      }
      if (element.playbackRate !== undefined && (!Number.isFinite(element.playbackRate) || element.playbackRate <= 0)) {
        throw new Error(`${trackId}.${present.id}.${element.id} has invalid playbackRate.`);
      }
    }
    if (element.kind === "text" && element.fonts !== undefined) {
      if (element.fonts.length === 0) throw new Error(`${trackId}.${present.id}.${element.id} has an empty font stack.`);
      const faces = new Set<string>();
      const requestedWeight = element.fonts[0]!.weight;
      const requestedStyle = element.fonts[0]!.style;
      for (const [index, font] of element.fonts.entries()) {
        assertFontArtifactRef(font, `${trackId}.${present.id}.${element.id}.fonts.${index}`);
        if (font.weight !== requestedWeight || font.style !== requestedStyle) {
          throw new Error(`${trackId}.${present.id}.${element.id} fallback fonts must describe one requested face.`);
        }
        const face = `${font.artifact.digest}:${font.weight}:${font.style}`;
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
      if (element.surface.timing.kind === "frames") {
        const durationFrames = present.span.endFrameExclusive - present.span.startFrame;
        if (element.surface.timing.frameCount !== durationFrames) {
          throw new Error(`${trackId}.${present.id}.${element.id} Surface must exactly match its Present frame domain.`);
        }
        if (programSpace !== undefined && (
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
          artifact: { ...font.artifact },
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
    };
  }
  return {
    ...common,
    kind: element.kind,
    artifact: { ...element.artifact },
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
        span: { ...clip.span },
        artifact: { ...clip.artifact },
        ...(clip.mediaStartSec === undefined ? {} : { mediaStartSec: clip.mediaStartSec }),
        ...(clip.playbackRate === undefined ? {} : { playbackRate: clip.playbackRate }),
        ...(clip.gain === undefined ? {} : { gain: clip.gain }),
        ...(clip.fadeInSec === undefined ? {} : { fadeInSec: clip.fadeInSec }),
        ...(clip.fadeOutSec === undefined ? {} : { fadeOutSec: clip.fadeOutSec }),
        ...(clip.bus === undefined ? {} : { bus: clip.bus }),
      }))
      .sort((a, b) => a.span.startFrame - b.span.startFrame || a.id.localeCompare(b.id)),
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
  const totalFrames = programSpace === undefined ? Number.MAX_SAFE_INTEGER : programSpaceFrameCount(programSpace);
  const clipIds = new Set<string>();
  for (const clip of track.clips) {
    if (clipIds.has(clip.id)) throw new Error(`${track.id} has duplicate clip ${clip.id}.`);
    clipIds.add(clip.id);
    assertNonEmpty(clip.id, `${track.id} clip id`);
    assertFrameSpan(clip.span, totalFrames, `${track.id}.${clip.id}.span`);
    assertArtifact(clip.artifact, `${track.id}.${clip.id}.artifact`);
    if (!clip.artifact.mediaType.startsWith("audio/") && !clip.artifact.mediaType.startsWith("video/")) {
      throw new Error(`${track.id}.${clip.id} is not an audio-capable Artifact.`);
    }
    for (const [name, value] of Object.entries({
      mediaStartSec: clip.mediaStartSec,
      gain: clip.gain,
      fadeInSec: clip.fadeInSec,
      fadeOutSec: clip.fadeOutSec,
    })) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`${track.id}.${clip.id} has invalid ${name}.`);
      }
    }
    if (clip.playbackRate !== undefined && (!Number.isFinite(clip.playbackRate) || clip.playbackRate <= 0)) {
      throw new Error(`${track.id}.${clip.id} has invalid playbackRate.`);
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
