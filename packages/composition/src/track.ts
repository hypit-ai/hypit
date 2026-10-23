import { assertAudioLevelAutomation } from "./audio-level-automation.js";
import type { AudioLevelAutomation, AudioSampleSpan } from "./audio-level-automation.js";
import { assertBlobRef, canonicalStringify, compareCodeUnits } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";

import {
  assertVisualStyleV1,
  VISUAL_IR_V1,
} from "./visual.js";
import { assertTimelineIdentity, timelineFrameCount, timelineSampleFrames } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { assertCompositableSurfaceRef, assertFontArtifactRef } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";

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

export type VisualElementBase = {
  readonly id: string;
  readonly style: readonly VisualStyleDeclaration[];
  readonly attributes?: readonly VisualAttribute[];
  readonly animation?: VisualAnimation;
};

export type VisualBoxElement = VisualElementBase & {
  readonly kind: "box";
  /** Semantic sibling order, from back to front. */
  readonly children: readonly VisualElement[];
};

/** A renderer-interpreted local program. Its format and payload belong to its rendering package. */
export type VisualProgram = {
  readonly format: string;
  readonly payload: { readonly [key: string]: CanonicalValue };
  readonly artifacts: readonly BlobRef[];
};

export type VisualProgramElement = VisualElementBase & {
  readonly kind: "program";
  readonly program: VisualProgram;
  /** Programme-defined named roles. Slot order has no paint meaning. */
  readonly slots: readonly { readonly name: string; readonly element: VisualElement }[];
};

/** A strictly local two-input mask whose roles are explicit in the tree. */
export type VisualMaskElement = VisualElementBase & {
  readonly kind: "mask";
  readonly mode: "alpha" | "luminance";
  readonly mask: VisualElement;
  readonly content: VisualElement;
};

export type VisualTextElement = VisualElementBase & {
  readonly kind: "text";
  readonly text: string;
  /** Exact ordered fallback faces. Terminal Visual IR never depends on environment fonts. */
  readonly fonts: readonly FontArtifactRef[];
  /**
   * Ordered glyph Paint, in the same vocabulary Text Flow uses.
   *
   * Style alone can only say `-webkit-text-stroke`, which centres an outline on the glyph edge and
   * therefore spends half its width inside the letter. An outline that is asked to sit outside the
   * letter cannot be expressed that way at all. Declaring the Paint instead lets the renderer build
   * the placement that was asked for, and `stroke` before `fill` orders them.
   */
  readonly paints?: readonly VisualTextPaintLayer[];
};

export type VisualTextDirection = "auto" | "ltr" | "rtl";
export type VisualTextWritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";

export type VisualTextTypography = {
  /** Exact ordered faces. Author-package prototype families must resolve before this boundary. */
  readonly fonts: readonly FontArtifactRef[];
  readonly sizePx: number;
  readonly weight: number;
  readonly style: "normal" | "italic" | "oblique";
  readonly axes: readonly { readonly tag: string; readonly value: number }[];
  readonly features: readonly { readonly tag: string; readonly enabled: boolean }[];
  readonly synthesis: "none" | "weight" | "style" | "weight-style";
  readonly kerning: "auto" | "normal" | "none";
  readonly trackingPx: number;
  readonly wordSpacingPx: number;
  readonly lineHeight: number;
  readonly language?: string;
  readonly direction: VisualTextDirection;
  readonly writingMode: VisualTextWritingMode;
  readonly baselineShiftPx: number;
  readonly tabSize: number;
  readonly indentationPx: number;
  readonly paragraphBeforePx: number;
  readonly paragraphAfterPx: number;
  readonly transform: "none" | "uppercase" | "lowercase" | "capitalize";
  readonly variantCaps: "normal" | "small-caps" | "all-small-caps";
  readonly verticalAlign: "baseline" | "super" | "sub";
  readonly decorations: readonly VisualTextDecoration[];
  readonly cjk: {
    readonly textSpacing: "normal" | "none";
    readonly punctuationTrim: "none" | "start" | "end" | "adjacent" | "all";
  };
};

/** Explicit run override. Omitted properties inherit; authored text never changes. */
export type VisualTextRunStyle = {
  readonly typography?: Partial<VisualTextTypography>;
  readonly paints?: readonly VisualTextPaintLayer[];
};

export type VisualTextInline =
  | {
      readonly kind: "text";
      readonly id: string;
      readonly text: string;
      readonly style?: VisualTextRunStyle;
      readonly language?: string;
      readonly direction?: VisualTextDirection;
    }
  | { readonly kind: "break"; readonly id: string };

export type VisualTextDocument = {
  readonly paragraphs: readonly {
    readonly id: string;
    readonly inlines: readonly VisualTextInline[];
    readonly style?: VisualTextRunStyle;
  }[];
};

export type VisualColorPaint =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear-gradient";
      readonly angleDeg: number;
      readonly stops: readonly { readonly offset: number; readonly color: string; readonly opacity: number }[];
    }
  | {
      readonly kind: "radial-gradient";
      readonly center: { readonly x: number; readonly y: number };
      readonly stops: readonly { readonly offset: number; readonly color: string; readonly opacity: number }[];
    };

export type VisualTextDecoration = {
  readonly line: "underline" | "overline" | "line-through";
  readonly paint: VisualColorPaint;
  readonly style: "solid" | "double" | "dotted" | "dashed" | "wavy";
  readonly thicknessPx?: number;
  readonly offsetPx?: number;
  readonly skipInk: boolean;
};

export type VisualTextBoxDecoration = {
  readonly fill?: VisualColorPaint;
  readonly border?: {
    readonly paint: VisualColorPaint;
    readonly widthsPx: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
    readonly style: "solid" | "dashed" | "dotted";
  };
  readonly paddingPx: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly radiiPx: { readonly topLeft: number; readonly topRight: number; readonly bottomRight: number; readonly bottomLeft: number };
  readonly shadows: readonly {
    readonly paint: VisualColorPaint;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blurPx: number;
    readonly spreadPx: number;
  }[];
  readonly tail?: {
    readonly side: "top" | "right" | "bottom" | "left";
    readonly offset: number;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly paint: VisualColorPaint;
  };
};

export type VisualTextPaintTarget = "frame" | "content" | "paragraph" | "line" | "run" | "word" | "grapheme";

/** Ordered renderer-neutral text Paint. Repetition and array order are semantic. */
export type VisualTextPaintLayer =
  | { readonly kind: "fill"; readonly paint: VisualColorPaint }
  | {
      readonly kind: "stroke";
      readonly paint: VisualColorPaint;
      readonly widthPx: number;
      readonly placement: "inside" | "center" | "outside";
    }
  | {
      readonly kind: "shadow";
      readonly paint: VisualColorPaint;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly blurPx: number;
      readonly spreadPx: number;
    }
  | { readonly kind: "glow"; readonly paint: VisualColorPaint; readonly blurPx: number; readonly spreadPx: number }
  | {
      readonly kind: "box";
      readonly target: VisualTextPaintTarget;
      readonly continuity: "isolated" | "joined";
      readonly decoration: VisualTextBoxDecoration;
    };

export type VisualTextFlow = {
  readonly form:
    | {
        readonly kind: "point";
        readonly anchorInline: "start" | "center" | "end";
        readonly anchorBlock: "start" | "center" | "end";
      }
    | { readonly kind: "area" };
  readonly inlineSize: "hug" | "fixed";
  readonly blockSize: "hug" | "fixed";
  readonly paddingPx: { readonly inlineStart: number; readonly inlineEnd: number; readonly blockStart: number; readonly blockEnd: number };
  readonly inlineAlign: "start" | "center" | "end" | "justify";
  readonly blockAlign: "start" | "center" | "end";
  readonly wrap: "none" | "word" | "grapheme";
  readonly overflow: "visible" | "clip" | "ellipsis" | "shrink";
  readonly maxLines?: number;
  readonly minimumScale?: number;
  readonly clipToFrame: boolean;
  readonly columns: number;
  readonly columnGapPx: number;
  readonly metricEdge: "line-box" | "cap-height" | "ink";
};

export type VisualTextSequenceAnimation = {
  readonly id: string;
  readonly unit: "paragraph" | "line" | "run" | "word" | "grapheme";
  readonly range: { readonly start: number; readonly endExclusive: number };
  readonly order: "forward" | "reverse" | "random";
  readonly startFrame: number;
  readonly unitDurationFrames: number;
  readonly staggerFrames: number;
  readonly cycles: number;
  readonly seed?: number;
  readonly keyframes: readonly {
    readonly atProgress: number;
    readonly easing?: VisualEasing;
    readonly style: readonly VisualStyleDeclaration[];
  }[];
};

/** Exact terminal text flow. It contains no author Style/Recipe reference or renderer callback. */
export type VisualTextFlowElement = VisualElementBase & {
  readonly kind: "text-flow";
  readonly document: VisualTextDocument;
  readonly typography: VisualTextTypography;
  readonly paints: readonly VisualTextPaintLayer[];
  readonly flow: VisualTextFlow;
  readonly sequences: readonly VisualTextSequenceAnimation[];
};

export type VisualVectorPathCommand =
  | { readonly kind: "move" | "line"; readonly x: number; readonly y: number }
  | { readonly kind: "quadratic"; readonly controlX: number; readonly controlY: number; readonly x: number; readonly y: number }
  | { readonly kind: "cubic"; readonly control1X: number; readonly control1Y: number; readonly control2X: number; readonly control2Y: number; readonly x: number; readonly y: number }
  | { readonly kind: "close" };

export type VisualPathTextElement = VisualElementBase & {
  readonly kind: "path-text";
  readonly document: VisualTextDocument;
  readonly typography: VisualTextTypography;
  readonly paints: readonly VisualTextPaintLayer[];
  readonly path: readonly VisualVectorPathCommand[];
  readonly side: "left" | "right";
  readonly orientation: "follow" | "upright";
  readonly startMarginPx: number;
  readonly endMarginPx: number;
  readonly align: "start" | "center" | "end";
  readonly reverse: boolean;
  readonly overflow: "visible" | "clip";
  readonly sequences: readonly VisualTextSequenceAnimation[];
  readonly marginAnimation?: {
    readonly keyframes: readonly {
      readonly atFrame: number;
      readonly startMarginPx: number;
      readonly easing?: VisualEasing;
    }[];
  };
};

export type VisualSourceTimeRational = {
  readonly numerator: number;
  readonly denominator: number;
};

/**
 * One exact piece of a timed visual's source-time function. Target frames are
 * relative to the containing Present. A gap means the material is invisible.
 */
export type VisualSourceTimePiece = {
  readonly target: FrameSpan;
  /** Absolute source-frame position at target.startFrame. */
  readonly sourceAtStart: VisualSourceTimeRational;
  /** Source frames advanced per Program frame; zero is an exact held frame. */
  readonly rate: VisualSourceTimeRational;
  /** Half-open source interval used for periodic evaluation. */
  readonly wrap?: FrameSpan;
};

export type VisualSourceTimeMap = {
  readonly sourceFrameRate: VisualSourceTimeRational;
  readonly sourceFrameCount: number;
  readonly pieces: readonly VisualSourceTimePiece[];
};

export type VisualMediaElement =
  | (VisualElementBase & {
      readonly kind: "image";
      readonly artifact: BlobRef;
    })
  | (VisualElementBase & {
      readonly kind: "video";
      readonly artifact: BlobRef;
      /** Exact partial frame-domain function for this timed source. */
      readonly sourceTime: VisualSourceTimeMap;
      readonly muted?: boolean;
    });

/** A package-materialized visual surface with content-bound compositing metadata, not an untyped media guess. */
export type VisualSurfaceElement = VisualElementBase & {
  readonly kind: "surface";
  readonly surface: CompositableSurfaceRef;
  /** Required exactly when surface.timing is frames; absent for a still Surface. */
  readonly sourceTime?: VisualSourceTimeMap;
};

/**
 * Structural elements and explicit renderer programs compose in one owned tree.
 *
 * A Present holds exactly one recursive root. **Position is measured from that parent, not from the Canvas.**
 * A component that computes its layout in Canvas pixels and then nests its elements has to subtract the parent's own origin,
 * or every child lands offset by it — which draws without complaint and is wrong by exactly the
 * distance the parent sits from the corner.
 */
export type VisualElement = VisualBoxElement | VisualProgramElement | VisualMaskElement | VisualTextElement | VisualTextFlowElement | VisualPathTextElement | VisualMediaElement | VisualSurfaceElement;

export type VisualItemBase = {
  readonly id: string;
  /** Optional domain entity implemented by this renderer item. */
  readonly subjectId?: string;
  readonly span: FrameSpan;
  /** Optional visible subranges in program frames; span remains the animation and sampling origin. */
  readonly visibility?: readonly FrameSpan[];
};

export type VisualPresent = VisualItemBase & {
  readonly kind: "present";
  readonly root: VisualElement;
};

/** A source-free transformation of the Picture accumulated below this stack position. */
export type VisualAdjustment = VisualItemBase & {
  readonly kind: "adjustment";
  readonly program: VisualProgram;
};

export type VisualItem = VisualPresent | VisualAdjustment;

/** Narrow construction input for the common source-owning subset. */
export type VisualPresentDraft = Omit<VisualPresent, "kind">;

export type VisualTrack = {
  readonly kind: "visual";
  /** Timeline identity this terminal placement was rendered against. */
  readonly timelineId: string;
  /** The one terminal visual language shared by official video components. */
  readonly visualIr: typeof VISUAL_IR_V1;
  readonly id: string;
  /** Author-owned contributions that Composition interleaves in their containing VisualScope. */
  readonly items: readonly VisualItem[];
};

/** The ordinary source-owning subset returned by Present component constructors. */
export type PresentVisualTrack = Omit<VisualTrack, "items"> & {
  readonly items: readonly VisualPresent[];
};

export type AudioSourceTimeRational = {
  readonly numerator: number;
  readonly denominator: number;
};

export type AudioSourceTimePiece = {
  /** Clip-local target samples. Uncovered samples are silent. */
  readonly target: AudioSampleSpan;
  readonly sourceAtStart: AudioSourceTimeRational;
  /** Positive source samples advanced per target sample. */
  readonly rate: AudioSourceTimeRational;
  readonly wrap?: AudioSampleSpan;
};

export type AudioSourceTimeMap = {
  readonly sourceSampleFrames: number;
  readonly pieces: readonly AudioSourceTimePiece[];
};

export type AudioClip = AudioLevelAutomation & {
  readonly id: string;
  /** Optional domain entity implemented by this renderer Clip. */
  readonly subjectId?: string;
  /** Bytes only. Exact duration belongs to source.sampleFrames, not duplicated floating metadata. */
  readonly artifact: BlobRef;
  /** Exact audible placement in the canonical 48 kHz Timeline sample domain. */
  readonly target: {
    readonly startSample: number;
    readonly endSampleExclusive: number;
  };
  /** Partial Clip-local target-to-source relation for one canonical 48 kHz stereo WAV Artifact. */
  readonly sourceTime: AudioSourceTimeMap;
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

export type AudioSignalRef = {
  readonly node: string;
  readonly port: "signal";
};

/** Renderer-owned signal processor with explicit resources and typed input ports. */
export type AudioProcessProgram = {
  readonly format: string;
  readonly payload: { readonly [key: string]: CanonicalValue };
  readonly artifacts: readonly BlobRef[];
};

export type AudioGraphNode =
  | { readonly kind: "silence"; readonly id: string }
  | { readonly kind: "source"; readonly id: string; readonly clip: AudioClip }
  | { readonly kind: "mix"; readonly id: string; readonly inputs: readonly AudioSignalRef[] }
  | {
      readonly kind: "process";
      readonly id: string;
      /** Port names and roles belong to the programme format; `signal` is the primary programme input. */
      readonly inputs: Readonly<Record<string, AudioSignalRef>>;
      readonly program: AudioProcessProgram;
    };

export type AudioSignalGraph = {
  readonly nodes: readonly AudioGraphNode[];
  readonly output: AudioSignalRef;
};

export type AudioTrack = {
  readonly kind: "audio";
  /** Timeline identity this terminal placement was rendered against. */
  readonly timelineId: string;
  readonly id: string;
  /** One closed, finite, single-output signal graph. */
  readonly graph: AudioSignalGraph;
};

export type Track = VisualTrack | AudioTrack;

export type VisualScopeTrackMember = {
  readonly kind: "track";
  /** Stable identity of this use of a Track inside its parent VisualScope. */
  readonly id: string;
  readonly track: VisualTrack;
};

export type VisualScopeStackMember = {
  readonly kind: "stack";
  /** Stable identity of this composited visual sub-tree inside its parent scope. */
  readonly id: string;
  readonly scope: VisualScope;
};

export type VisualScopeMember = VisualScopeTrackMember | VisualScopeStackMember;

/**
 * One recursively composited visual domain. Array position is the complete
 * back-to-front order. Tracks contribute ordered visual
 * programmes; a Stack closes a child domain and contributes its resulting
 * picture as one programme to the parent domain.
 */
export type VisualScope = {
  readonly members: readonly VisualScopeMember[];
};

/** One exact use of a VisualTrack, addressed independently of the reusable Track value. */
export type VisualTrackOccurrence = {
  readonly path: readonly string[];
  readonly member: VisualScopeTrackMember;
};

export type Composition = {
  readonly id: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    /** Structural clear color beneath every VisualTrack. */
    readonly clearColor: string;
  };
  readonly visual: VisualScope;
  /** Film-level audio is the additive sum of already closed AudioTrack outputs. */
  readonly audio: readonly AudioTrack[];
};

/** The only local style properties accepted in element keyframes. */
export const animatableLocalStyles = [
  "backdrop-filter",
  "clip-path",
  "filter",
  "opacity",
  "transform",
] as const;
const ANIMATABLE_LOCAL_STYLES = new Set<string>(animatableLocalStyles);

const ANIMATABLE_TEXT_UNIT_STYLES = new Set([
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "background-color",
  "color",
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
    throw new Error(`${label} is outside Timeline.`);
  }
}

function assertMediaArtifact(artifact: BlobRef, label: string): void {
  assertBlobRef(artifact, label);
}

function assertRational(value: VisualSourceTimeRational, label: string, sign: "positive" | "non-negative" | "signed"): void {
  if (!Number.isSafeInteger(value.numerator)
    || (sign === "positive" && value.numerator <= 0)
    || (sign === "non-negative" && value.numerator < 0)
    || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
    throw new Error(`${label} is not a safe ${sign} rational.`);
  }
}

function compareRationalToInteger(value: VisualSourceTimeRational, integer: number): number {
  const difference = BigInt(value.numerator) - BigInt(integer) * BigInt(value.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function sourceAt(piece: VisualSourceTimePiece, targetOffset: number): VisualSourceTimeRational {
  const denominator = BigInt(piece.sourceAtStart.denominator) * BigInt(piece.rate.denominator);
  const numerator = BigInt(piece.sourceAtStart.numerator) * BigInt(piece.rate.denominator)
    + BigInt(targetOffset) * BigInt(piece.rate.numerator) * BigInt(piece.sourceAtStart.denominator);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || numerator < BigInt(Number.MIN_SAFE_INTEGER)
    || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Visual source-time arithmetic exceeds the safe wire domain.");
  }
  return { numerator: Number(numerator), denominator: Number(denominator) };
}

function assertSourceTime(value: VisualSourceTimeMap, durationFrames: number, label: string): void {
  assertRational(value.sourceFrameRate, `${label}.sourceFrameRate`, "positive");
  if (!Number.isSafeInteger(value.sourceFrameCount) || value.sourceFrameCount <= 0 || value.pieces.length === 0) {
    throw new Error(`${label} source frame domain is invalid.`);
  }
  let previousEnd = 0;
  for (const [index, piece] of value.pieces.entries()) {
    const item = `${label}.pieces.${index}`;
    if (!Number.isSafeInteger(piece.target.startFrame) || !Number.isSafeInteger(piece.target.endFrameExclusive)
      || piece.target.startFrame < previousEnd || piece.target.endFrameExclusive <= piece.target.startFrame
      || piece.target.endFrameExclusive > durationFrames) throw new Error(`${item} target interval is invalid.`);
    assertRational(piece.sourceAtStart, `${item}.sourceAtStart`, "non-negative");
    assertRational(piece.rate, `${item}.rate`, "signed");
    if (piece.wrap !== undefined) {
      if (!Number.isSafeInteger(piece.wrap.startFrame) || !Number.isSafeInteger(piece.wrap.endFrameExclusive)
        || piece.wrap.startFrame < 0 || piece.wrap.endFrameExclusive <= piece.wrap.startFrame
        || piece.wrap.endFrameExclusive > value.sourceFrameCount
        || compareRationalToInteger(piece.sourceAtStart, piece.wrap.startFrame) < 0
        || compareRationalToInteger(piece.sourceAtStart, piece.wrap.endFrameExclusive) >= 0) {
        throw new Error(`${item} wrap interval or phase is invalid.`);
      }
    } else {
      const last = sourceAt(piece, piece.target.endFrameExclusive - piece.target.startFrame - 1);
      if (compareRationalToInteger(piece.sourceAtStart, 0) < 0
        || compareRationalToInteger(piece.sourceAtStart, value.sourceFrameCount) >= 0
        || compareRationalToInteger(last, 0) < 0
        || compareRationalToInteger(last, value.sourceFrameCount) >= 0) {
        throw new Error(`${item} samples outside its source frame domain.`);
      }
    }
    previousEnd = piece.target.endFrameExclusive;
  }
}

function assertAudioArtifact(artifact: BlobRef, label: string): void {
  try {
    assertBlobRef(artifact, label);
  } catch {
    throw new Error(`${label} must be a canonical WAV BlobRef.`);
  }
  if (artifact.mediaType !== "audio/wav") {
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
    if (!/^(?:data-[a-z0-9-]+|aria-[a-z0-9-]+|role|title|lang|dir)$/u.test(attribute.name)) {
      throw new Error(`${label} contains unsafe attribute ${attribute.name}.`);
    }
    if (attribute.name === "lang" && !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(attribute.value)) {
      throw new Error(`${label} contains invalid lang ${attribute.value}.`);
    }
    if (attribute.name === "dir" && !["ltr", "rtl", "auto"].includes(attribute.value)) {
      throw new Error(`${label} contains invalid dir ${attribute.value}.`);
    }
    if (names.has(attribute.name)) {
      throw new Error(`${label} contains duplicate attribute ${attribute.name}.`);
    }
    names.add(attribute.name);
  }
}

function assertExactFonts(fonts: readonly FontArtifactRef[], label: string): void {
  if (fonts.length === 0) throw new Error(`${label} has an empty font stack.`);
  const faces = new Set<string>();
  for (const [index, font] of fonts.entries()) {
    assertFontArtifactRef(font, `${label}.${index}`);
    const face = canonicalStringify(font);
    if (faces.has(face)) throw new Error(`${label} has a duplicate font face.`);
    faces.add(face);
  }
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must not be negative.`);
}

function assertColor(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (value.length > 256
    || /[;{}<>"'\\]|!important|[\u0000-\u001f\u007f]/iu.test(value)
    || /(?:url|var|env|attr|image-set)\s*\(/iu.test(value)) {
    throw new Error(`${label} contains an unsafe or environment-dependent color.`);
  }
}

function assertColorPaint(paint: VisualColorPaint, label: string): void {
  if (paint.kind === "solid") {
    assertColor(paint.color, `${label}.color`);
    return;
  }
  if (paint.kind !== "linear-gradient" && paint.kind !== "radial-gradient") {
    throw new Error(`${label} has an unsupported Paint kind.`);
  }
  if (paint.kind === "linear-gradient") finite(paint.angleDeg, `${label}.angleDeg`);
  else {
    finite(paint.center.x, `${label}.center.x`);
    finite(paint.center.y, `${label}.center.y`);
    if (paint.center.x < 0 || paint.center.x > 1 || paint.center.y < 0 || paint.center.y > 1) {
      throw new Error(`${label}.center must be normalized.`);
    }
  }
  if (paint.stops.length < 2) throw new Error(`${label} requires at least two gradient stops.`);
  let previous = -1;
  for (const [index, stop] of paint.stops.entries()) {
    finite(stop.offset, `${label}.stops.${index}.offset`);
    finite(stop.opacity, `${label}.stops.${index}.opacity`);
    assertColor(stop.color, `${label}.stops.${index}.color`);
    if (stop.offset < 0 || stop.offset > 1 || stop.offset < previous || stop.opacity < 0 || stop.opacity > 1) {
      throw new Error(`${label} has invalid gradient stops.`);
    }
    previous = stop.offset;
  }
}

function assertTypography(typography: VisualTextTypography, label: string): void {
  assertExactFonts(typography.fonts, `${label}.fonts`);
  finite(typography.sizePx, `${label}.sizePx`);
  if (typography.sizePx <= 0 || !Number.isSafeInteger(typography.weight) || typography.weight < 1 || typography.weight > 1_000) {
    throw new Error(`${label} size or weight is invalid.`);
  }
  if (!["normal", "italic", "oblique"].includes(typography.style)
    || !["none", "weight", "style", "weight-style"].includes(typography.synthesis)
    || !["auto", "normal", "none"].includes(typography.kerning)
    || !["auto", "ltr", "rtl"].includes(typography.direction)
    || !["horizontal-tb", "vertical-rl", "vertical-lr"].includes(typography.writingMode)
    || !["none", "uppercase", "lowercase", "capitalize"].includes(typography.transform)
    || !["normal", "small-caps", "all-small-caps"].includes(typography.variantCaps)
    || !["baseline", "super", "sub"].includes(typography.verticalAlign)) {
    throw new Error(`${label} contains an unsupported typography enum.`);
  }
  for (const [name, value] of Object.entries({
    trackingPx: typography.trackingPx,
    wordSpacingPx: typography.wordSpacingPx,
    lineHeight: typography.lineHeight,
    baselineShiftPx: typography.baselineShiftPx,
    indentationPx: typography.indentationPx,
    paragraphBeforePx: typography.paragraphBeforePx,
    paragraphAfterPx: typography.paragraphAfterPx,
  })) finite(value, `${label}.${name}`);
  if (typography.lineHeight <= 0 || !Number.isSafeInteger(typography.tabSize) || typography.tabSize <= 0) {
    throw new Error(`${label} lineHeight or tabSize is invalid.`);
  }
  const axes = new Set<string>();
  for (const [index, axis] of typography.axes.entries()) {
    if (!/^[\x20-\x7e]{4}$/u.test(axis.tag) || axes.has(axis.tag)) throw new Error(`${label}.axes.${index} is invalid.`);
    finite(axis.value, `${label}.axes.${index}.value`);
    axes.add(axis.tag);
  }
  const features = new Set<string>();
  for (const [index, feature] of typography.features.entries()) {
    if (!/^[\x20-\x7e]{4}$/u.test(feature.tag) || features.has(feature.tag)) throw new Error(`${label}.features.${index} is invalid.`);
    features.add(feature.tag);
  }
  const decorations = new Set<string>();
  for (const [index, decoration] of typography.decorations.entries()) {
    const item = `${label}.decorations.${index}`;
    if (!["underline", "overline", "line-through"].includes(decoration.line)
      || !["solid", "double", "dotted", "dashed", "wavy"].includes(decoration.style)
      || decorations.has(decoration.line)) {
      throw new Error(`${item} is invalid or repeated.`);
    }
    decorations.add(decoration.line);
    assertColorPaint(decoration.paint, `${item}.paint`);
    if (decoration.thicknessPx !== undefined) nonNegative(decoration.thicknessPx, `${item}.thicknessPx`);
    if (decoration.offsetPx !== undefined) finite(decoration.offsetPx, `${item}.offsetPx`);
  }
}

function assertRunStyle(style: VisualTextRunStyle | undefined, label: string): void {
  if (style === undefined) return;
  if (style.typography !== undefined) {
    const merged = style.typography;
    if (merged.fonts !== undefined) assertExactFonts(merged.fonts, `${label}.fonts`);
    for (const [name, value] of Object.entries(merged)) {
      if (typeof value === "number") finite(value, `${label}.${name}`);
    }
  }
  for (const [index, paint] of (style.paints ?? []).entries()) assertTextPaint(paint, `${label}.paints.${index}`);
}

function inheritedTypography(
  base: VisualTextTypography,
  style: VisualTextRunStyle | undefined,
): VisualTextTypography {
  const override = style?.typography;
  if (override === undefined) return base;
  const {
    fonts: _fonts,
    axes: _axes,
    features: _features,
    decorations: _decorations,
    cjk: _cjk,
    ...scalarOverrides
  } = override;
  return {
    ...base,
    ...scalarOverrides,
    fonts: override.fonts ?? base.fonts,
    axes: override.axes ?? base.axes,
    features: override.features ?? base.features,
    decorations: override.decorations ?? base.decorations,
    cjk: override.cjk === undefined ? base.cjk : { ...base.cjk, ...override.cjk },
  };
}

function assertTextDocument(
  document: VisualTextDocument,
  typography: VisualTextTypography,
  label: string,
): void {
  if (document.paragraphs.length === 0) throw new Error(`${label} has no paragraphs.`);
  const ids = new Set<string>();
  let hasText = false;
  for (const [paragraphIndex, paragraph] of document.paragraphs.entries()) {
    assertNonEmpty(paragraph.id, `${label}.paragraphs.${paragraphIndex}.id`);
    if (ids.has(paragraph.id) || paragraph.inlines.length === 0) throw new Error(`${label} has an invalid paragraph.`);
    ids.add(paragraph.id);
    assertRunStyle(paragraph.style, `${label}.paragraphs.${paragraphIndex}.style`);
    const paragraphTypography = inheritedTypography(typography, paragraph.style);
    assertTypography(paragraphTypography, `${label}.paragraphs.${paragraphIndex}.typography`);
    for (const [inlineIndex, inline] of paragraph.inlines.entries()) {
      assertNonEmpty(inline.id, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.id`);
      if (ids.has(inline.id)) throw new Error(`${label} repeats inline id ${inline.id}.`);
      ids.add(inline.id);
      if (inline.kind === "text") {
        if (inline.text.length === 0) throw new Error(`${label} contains an empty text run.`);
        hasText ||= inline.text.trim().length > 0;
        assertRunStyle(inline.style, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.style`);
        const inlineTypography = inheritedTypography(paragraphTypography, inline.style);
        assertTypography(inlineTypography, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.typography`);
        if (inline.direction !== undefined && !["auto", "ltr", "rtl"].includes(inline.direction)) {
          throw new Error(`${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.direction is invalid.`);
        }
      } else if (inline.kind !== "break") throw new Error(`${label} contains an unsupported inline.`);
    }
  }
  if (!hasText) throw new Error(`${label} contains no visible text.`);
}

function assertBoxDecoration(decoration: VisualTextBoxDecoration, label: string): void {
  if (decoration.fill !== undefined) assertColorPaint(decoration.fill, `${label}.fill`);
  for (const [name, value] of Object.entries(decoration.paddingPx)) nonNegative(value, `${label}.paddingPx.${name}`);
  for (const [name, value] of Object.entries(decoration.radiiPx)) nonNegative(value, `${label}.radiiPx.${name}`);
  if (decoration.border !== undefined) {
    assertColorPaint(decoration.border.paint, `${label}.border.paint`);
    if (!["solid", "dashed", "dotted"].includes(decoration.border.style)) {
      throw new Error(`${label}.border.style is invalid.`);
    }
    for (const [name, value] of Object.entries(decoration.border.widthsPx)) nonNegative(value, `${label}.border.widthsPx.${name}`);
  }
  for (const [index, shadow] of decoration.shadows.entries()) {
    assertColorPaint(shadow.paint, `${label}.shadows.${index}.paint`);
    finite(shadow.offsetX, `${label}.shadows.${index}.offsetX`);
    finite(shadow.offsetY, `${label}.shadows.${index}.offsetY`);
    nonNegative(shadow.blurPx, `${label}.shadows.${index}.blurPx`);
    finite(shadow.spreadPx, `${label}.shadows.${index}.spreadPx`);
  }
  if (decoration.tail !== undefined) {
    if (!["top", "right", "bottom", "left"].includes(decoration.tail.side)) {
      throw new Error(`${label}.tail.side is invalid.`);
    }
    finite(decoration.tail.offset, `${label}.tail.offset`);
    nonNegative(decoration.tail.widthPx, `${label}.tail.widthPx`);
    nonNegative(decoration.tail.heightPx, `${label}.tail.heightPx`);
    assertColorPaint(decoration.tail.paint, `${label}.tail.paint`);
  }
}

function assertTextPaint(paint: VisualTextPaintLayer, label: string): void {
  if (paint.kind === "fill") return assertColorPaint(paint.paint, `${label}.paint`);
  if (paint.kind === "stroke") {
    assertColorPaint(paint.paint, `${label}.paint`);
    if (!["inside", "center", "outside"].includes(paint.placement)) {
      throw new Error(`${label}.placement is invalid.`);
    }
    return nonNegative(paint.widthPx, `${label}.widthPx`);
  }
  if (paint.kind === "shadow") {
    assertColorPaint(paint.paint, `${label}.paint`);
    finite(paint.offsetX, `${label}.offsetX`);
    finite(paint.offsetY, `${label}.offsetY`);
    nonNegative(paint.blurPx, `${label}.blurPx`);
    finite(paint.spreadPx, `${label}.spreadPx`);
    return;
  }
  if (paint.kind === "glow") {
    assertColorPaint(paint.paint, `${label}.paint`);
    nonNegative(paint.blurPx, `${label}.blurPx`);
    finite(paint.spreadPx, `${label}.spreadPx`);
    return;
  }
  if (paint.kind !== "box") throw new Error(`${label} has an unsupported Paint kind.`);
  if (paint.continuity === "joined" && !["line", "word", "grapheme"].includes(paint.target)) {
    throw new Error(`${label} joined continuity is invalid for ${paint.target}.`);
  }
  assertBoxDecoration(paint.decoration, `${label}.decoration`);
}

/** Validate the reusable renderer-neutral appearance shared by text components. */
export function assertVisualTextAppearance(
  appearance: {
    readonly typography: VisualTextTypography;
    readonly paints: readonly VisualTextPaintLayer[];
  },
  label = "Visual text appearance",
): void {
  assertTypography(appearance.typography, `${label}.typography`);
  const boxKeys = new Set<string>();
  for (const [index, paint] of appearance.paints.entries()) {
    assertTextPaint(paint, `${label}.paints.${index}`);
    if (paint.kind !== "box") continue;
    const key = `${paint.target}:${paint.continuity}`;
    if (boxKeys.has(key)) throw new Error(`${label} repeats Box Paint ${key}.`);
    boxKeys.add(key);
  }
}

function assertTextFlow(flow: VisualTextFlow, label: string): void {
  if (!(["hug", "fixed"] as const).includes(flow.inlineSize)
    || !(["hug", "fixed"] as const).includes(flow.blockSize)
    || !(["start", "center", "end", "justify"] as const).includes(flow.inlineAlign)
    || !(["start", "center", "end"] as const).includes(flow.blockAlign)
    || !(["none", "word", "grapheme"] as const).includes(flow.wrap)
    || !(["visible", "clip", "ellipsis", "shrink"] as const).includes(flow.overflow)
    || !(["line-box", "cap-height", "ink"] as const).includes(flow.metricEdge)) {
    throw new Error(`${label} contains an unsupported flow enum.`);
  }
  if (flow.form.kind === "point" && (flow.inlineSize !== "hug" || flow.blockSize !== "hug" || flow.wrap !== "none")) {
    throw new Error(`${label} Point Text must hug both axes and cannot soft-wrap.`);
  }
  for (const [name, value] of Object.entries(flow.paddingPx)) nonNegative(value, `${label}.paddingPx.${name}`);
  if (!Number.isSafeInteger(flow.columns) || flow.columns <= 0) throw new Error(`${label}.columns must be positive.`);
  nonNegative(flow.columnGapPx, `${label}.columnGapPx`);
  if (flow.maxLines !== undefined && (!Number.isSafeInteger(flow.maxLines) || flow.maxLines <= 0)) {
    throw new Error(`${label}.maxLines must be positive.`);
  }
  if (flow.maxLines !== undefined && flow.overflow !== "ellipsis" && flow.overflow !== "shrink") {
    throw new Error(`${label}.maxLines is valid only for ellipsis or shrink.`);
  }
  if (flow.overflow === "shrink") {
    if (flow.minimumScale === undefined || !Number.isFinite(flow.minimumScale) || flow.minimumScale <= 0 || flow.minimumScale > 1) {
      throw new Error(`${label}.minimumScale is required in (0, 1] for shrink.`);
    }
  } else if (flow.minimumScale !== undefined) throw new Error(`${label}.minimumScale is valid only for shrink.`);
}

function assertTextSequences(
  sequences: readonly VisualTextSequenceAnimation[],
  _durationFrames: number,
  label: string,
): void {
  const ids = new Set<string>();
  for (const [index, sequence] of sequences.entries()) {
    const item = `${label}.${index}`;
    assertNonEmpty(sequence.id, `${item}.id`);
    if (ids.has(sequence.id)) throw new Error(`${label} repeats ${sequence.id}.`);
    ids.add(sequence.id);
    if (!(["paragraph", "line", "run", "word", "grapheme"] as const).includes(sequence.unit)
      || !(["forward", "reverse", "random"] as const).includes(sequence.order)) {
      throw new Error(`${item} unit or order is invalid.`);
    }
    if (!Number.isSafeInteger(sequence.range.start) || !Number.isSafeInteger(sequence.range.endExclusive)
      || sequence.range.start < 0 || sequence.range.endExclusive <= sequence.range.start
      || !Number.isSafeInteger(sequence.startFrame) || sequence.startFrame < 0
      || !Number.isSafeInteger(sequence.unitDurationFrames) || sequence.unitDurationFrames <= 0
      || !Number.isSafeInteger(sequence.staggerFrames) || sequence.staggerFrames < 0
      || !Number.isSafeInteger(sequence.cycles) || sequence.cycles <= 0
      || (sequence.seed !== undefined && !Number.isSafeInteger(sequence.seed))) {
      throw new Error(`${item} frame domain or range is invalid.`);
    }
    if ((sequence.order === "random") !== (sequence.seed !== undefined)) {
      throw new Error(`${item} random order requires one explicit seed, and other orders forbid it.`);
    }
    if (sequence.keyframes.length < 2 || sequence.keyframes[0]?.atProgress !== 0 || sequence.keyframes.at(-1)?.atProgress !== 1) {
      throw new Error(`${item} keyframes must cover progress [0, 1].`);
    }
    let previous = -1;
    for (const [frameIndex, keyframe] of sequence.keyframes.entries()) {
      if (!Number.isFinite(keyframe.atProgress) || keyframe.atProgress <= previous || keyframe.atProgress < 0 || keyframe.atProgress > 1) {
        throw new Error(`${item}.keyframes.${frameIndex} progress is invalid.`);
      }
      assertStyle(keyframe.style, `${item}.keyframes.${frameIndex}.style`);
      if (keyframe.style.some((declaration) => !ANIMATABLE_TEXT_UNIT_STYLES.has(declaration.name))) {
        throw new Error(`${item}.keyframes.${frameIndex} animates an unsupported text-unit property.`);
      }
      previous = keyframe.atProgress;
    }
  }
}

function assertPathCommands(path: readonly VisualVectorPathCommand[], label: string): void {
  if (path.length < 2 || path[0]?.kind !== "move") throw new Error(`${label} must begin with move and contain drawable geometry.`);
  if (!path.some((command) => command.kind === "line" || command.kind === "quadratic" || command.kind === "cubic")) {
    throw new Error(`${label} contains no drawable geometry.`);
  }
  for (const [index, command] of path.entries()) {
    for (const [name, value] of Object.entries(command)) {
      if (name !== "kind") finite(value as number, `${label}.${index}.${name}`);
    }
  }
}

function assertAnimation(animation: VisualAnimation | undefined, _durationFrames: number, label: string): void {
  if (animation === undefined) return;
  if (animation.keyframes.length < 2) throw new Error(`${label} animation must contain at least two keyframes.`);
  let previous = -1;
  for (const [index, keyframe] of animation.keyframes.entries()) {
    if (
      !Number.isSafeInteger(keyframe.atFrame)
      || keyframe.atFrame < 0
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
}

function assertVisualItemBase(item: VisualItemBase, timeline: Timeline | undefined, trackId: string): void {
  const totalFrames = timeline === undefined ? Number.MAX_SAFE_INTEGER : timelineFrameCount(timeline);
  assertNonEmpty(item.id, `${trackId} Visual Item id`);
  if (item.subjectId !== undefined) assertNonEmpty(item.subjectId, `${trackId}.${item.id} subjectId`);
  assertFrameSpan(item.span, totalFrames, `${trackId}.${item.id}.span`);
  let previousEnd = item.span.startFrame;
  for (const span of item.visibility ?? []) {
    assertFrameSpan(span, item.span.endFrameExclusive, `${trackId}.${item.id}.visibility`);
    if (span.startFrame < previousEnd) throw new Error(`${trackId}.${item.id} visibility must be ordered within its span.`);
    previousEnd = span.endFrameExclusive;
  }
}

function assertVisualProgram(program: VisualProgram, label: string): void {
  assertNonEmpty(program.format, `${label}.format`);
  if (program.payload === null || typeof program.payload !== "object" || Array.isArray(program.payload)) {
    throw new Error(`${label}.payload must be an object.`);
  }
  canonicalStringify(program.payload);
  for (const artifact of program.artifacts) assertMediaArtifact(artifact, `${label}.artifacts`);
}

function assertAudioProcessProgram(program: AudioProcessProgram, label: string): void {
  if (program === null || typeof program !== "object") throw new Error(`${label} must be an object.`);
  if (typeof program.format !== "string") throw new Error(`${label}.format must be a string.`);
  assertNonEmpty(program.format, `${label}.format`);
  if (program.payload === null || typeof program.payload !== "object" || Array.isArray(program.payload)) {
    throw new Error(`${label}.payload must be an object.`);
  }
  canonicalStringify(program.payload);
  if (!Array.isArray(program.artifacts)) throw new Error(`${label}.artifacts must be an array.`);
  for (const artifact of program.artifacts) assertBlobRef(artifact, `${label}.artifacts`);
}

function assertElement(
  element: VisualElement,
  present: VisualPresent,
  trackId: string,
  ids: Set<string>,
): void {
  if (element === null || typeof element !== "object" || Array.isArray(element)) {
    throw new Error(`${trackId}.${present.id} contains an invalid element.`);
  }
  assertNonEmpty(element.id, `${trackId}.${present.id} element id`);
  if (ids.has(element.id)) throw new Error(`${trackId}.${present.id} has duplicate element ${element.id}.`);
  ids.add(element.id);
  const label = `${trackId}.${present.id}.${element.id}`;
  assertStyle(element.style, label);
  assertAttributes(element.attributes, label);
  assertAnimation(element.animation, present.span.endFrameExclusive - present.span.startFrame, label);

  if (element.kind === "box") {
    if (!Array.isArray(element.children)) throw new Error(`${label}.children is invalid.`);
    for (const child of element.children) assertElement(child, present, trackId, ids);
    return;
  }
  if (element.kind === "program") {
    assertVisualProgram(element.program, `${label}.program`);
    if (!Array.isArray(element.slots)) throw new Error(`${label}.slots is invalid.`);
    const names = new Set<string>();
    for (const slot of element.slots) {
      assertNonEmpty(slot.name, `${label} slot name`);
      if (names.has(slot.name)) throw new Error(`${label} has duplicate slot ${slot.name}.`);
      names.add(slot.name);
      assertElement(slot.element, present, trackId, ids);
    }
    return;
  }
  if (element.kind === "mask") {
    if (!["alpha", "luminance"].includes(element.mode)) throw new Error(`${label} has an invalid local mask.`);
    assertElement(element.mask, present, trackId, ids);
    assertElement(element.content, present, trackId, ids);
    const mask = element.mask;
    if (!["text", "text-flow", "path-text", "image", "surface"].includes(mask.kind)
      || (mask.kind === "surface" && mask.surface.timing.kind !== "still")) {
      throw new Error(`${label} mask source must be one terminal owned text, image or still Surface.`);
    }
    return;
  }
  if (element.kind === "image" || element.kind === "video") {
    assertMediaArtifact(element.artifact, `${label}.artifact`);
    if (!element.artifact.mediaType.startsWith(`${element.kind}/`)) {
      throw new Error(`${label} media kind does not match its Artifact.`);
    }
    if (element.kind === "video") {
      if (element.animation !== undefined) {
        throw new Error(`${label} source time and animation must live on separate owned elements.`);
      }
      assertSourceTime(element.sourceTime, present.span.endFrameExclusive - present.span.startFrame,
        `${label}.sourceTime`);
    }
    return;
  }
  if (element.kind === "text") {
    assertExactFonts(element.fonts, `${label}.fonts`);
    const ownedFontStyles = new Set(["font", "font-family", "font-style", "font-synthesis", "font-weight"]);
    if (element.style.some((declaration) => ownedFontStyles.has(declaration.name))) {
      throw new Error(`${label} exact fonts conflict with a raw font style.`);
    }
    for (const [index, paint] of (element.paints ?? []).entries()) {
      assertTextPaint(paint, `${label}.paints.${index}`);
      if (paint.kind === "box") throw new Error(`${label}.paints.${index} is Box Paint on a plain text element.`);
    }
    const paintedStyles = new Set(["-webkit-text-stroke", "-webkit-text-stroke-color", "-webkit-text-stroke-width", "paint-order"]);
    if (element.paints !== undefined && element.style.some((declaration) => paintedStyles.has(declaration.name))) {
      throw new Error(`${label} declares glyph Paint beside a raw stroke style.`);
    }
    return;
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    assertTextDocument(element.document, element.typography, `${label}.document`);
    assertVisualTextAppearance(element, label);
    assertTextSequences(element.sequences, present.span.endFrameExclusive - present.span.startFrame, `${label}.sequences`);
    if (element.kind === "text-flow") assertTextFlow(element.flow, `${label}.flow`);
    else {
      assertPathCommands(element.path, `${label}.path`);
      if (!(["left", "right"] as const).includes(element.side)
        || !(["follow", "upright"] as const).includes(element.orientation)
        || !(["start", "center", "end"] as const).includes(element.align)
        || !(["visible", "clip"] as const).includes(element.overflow)) {
        throw new Error(`${label} contains an unsupported Path Text enum.`);
      }
      nonNegative(element.startMarginPx, `${label}.startMarginPx`);
      nonNegative(element.endMarginPx, `${label}.endMarginPx`);
      if (element.marginAnimation !== undefined) {
        const frames = element.marginAnimation.keyframes;
        if (frames.length < 2) throw new Error(`${label}.marginAnimation requires two keyframes.`);
        let previous = -1;
        for (const [index, keyframe] of frames.entries()) {
          if (!Number.isSafeInteger(keyframe.atFrame) || keyframe.atFrame <= previous) {
            throw new Error(`${label}.marginAnimation.${index} has an invalid frame.`);
          }
          nonNegative(keyframe.startMarginPx, `${label}.marginAnimation.${index}.startMarginPx`);
          previous = keyframe.atFrame;
        }
      }
    }
    return;
  }
  if (element.kind === "surface") {
    assertCompositableSurfaceRef(element.surface, `${label}.surface`);
    if (element.surface.timing.kind === "still" && element.sourceTime !== undefined) {
      throw new Error(`${label} still Surface cannot have source time.`);
    }
    if (element.sourceTime !== undefined) {
      if (element.animation !== undefined) {
        throw new Error(`${label} source time and animation must live on separate owned elements.`);
      }
      if (element.surface.timing.kind !== "frames"
        || element.sourceTime.sourceFrameCount !== element.surface.timing.frameCount
        || element.sourceTime.sourceFrameRate.numerator !== element.surface.timing.frameRate.numerator
        || element.sourceTime.sourceFrameRate.denominator !== element.surface.timing.frameRate.denominator) {
        throw new Error(`${label} Surface source time differs from its typed timing.`);
      }
      assertSourceTime(element.sourceTime, present.span.endFrameExclusive - present.span.startFrame,
        `${label}.sourceTime`);
    }
    if (element.surface.timing.kind === "frames" && element.sourceTime === undefined) {
      throw new Error(`${label} timed Surface requires source time.`);
    }
    return;
  }
  throw new Error(`${label} has invalid element kind ${String((element as { readonly kind?: unknown }).kind)}.`);
}

function assertPresent(present: VisualPresent, timeline: Timeline | undefined, trackId: string): void {
  assertVisualItemBase(present, timeline, trackId);
  assertElement(present.root, present, trackId, new Set());
}

function assertAdjustment(adjustment: VisualAdjustment, timeline: Timeline | undefined, trackId: string): void {
  assertVisualItemBase(adjustment, timeline, trackId);
  assertVisualProgram(adjustment.program, `${trackId}.${adjustment.id}.program`);
}

function normalizeStyle(style: readonly VisualStyleDeclaration[]): VisualStyleDeclaration[] {
  return [...style]
    .map((item) => ({ name: item.name, value: item.value }))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
}

function normalizeAttributes(attributes: readonly VisualAttribute[]): readonly VisualAttribute[] {
  return [...attributes]
    .map((item) => ({ name: item.name, value: item.value }))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
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
    style: normalizeStyle(element.style),
    ...(element.attributes === undefined ? {} : { attributes: normalizeAttributes(element.attributes) }),
    ...(element.animation === undefined ? {} : { animation: normalizeAnimation(element.animation) }),
  };
  if (element.kind === "box") return {
    ...common,
    kind: "box",
    children: element.children.map(normalizeElement),
  };
  if (element.kind === "program") return {
    ...common,
    kind: "program",
    program: structuredClone(element.program),
    slots: element.slots.map((slot) => ({ name: slot.name, element: normalizeElement(slot.element) })),
  };
  if (element.kind === "mask") return {
    ...common,
    kind: "mask",
    mode: element.mode,
    mask: normalizeElement(element.mask),
    content: normalizeElement(element.content),
  };
  if (element.kind === "text") {
    return {
      ...common,
      kind: "text",
      text: element.text,
      fonts: element.fonts.map((font) => ({
          sources: font.sources.map((source) => ({
            artifact: { ...source.artifact },
            ...(source.unicodeRange === undefined ? {} : { unicodeRange: source.unicodeRange }),
          })),
          weight: font.weight,
          style: font.style,
        })),
      ...(element.paints === undefined ? {} : { paints: structuredClone(element.paints) as VisualTextPaintLayer[] }),
    };
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    const copy = structuredClone(element);
    return {
      ...copy,
      ...common,
      kind: element.kind,
      sequences: element.sequences.map((sequence) => ({
        ...sequence,
        range: { ...sequence.range },
        keyframes: sequence.keyframes.map((keyframe) => ({
          ...keyframe,
          style: normalizeStyle(keyframe.style),
        })),
      })),
    } as VisualTextFlowElement | VisualPathTextElement;
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
      ...(element.sourceTime === undefined ? {} : { sourceTime: {
        sourceFrameRate: { ...element.sourceTime.sourceFrameRate },
        sourceFrameCount: element.sourceTime.sourceFrameCount,
        pieces: element.sourceTime.pieces.map((piece) => ({
          target: { ...piece.target }, sourceAtStart: { ...piece.sourceAtStart }, rate: { ...piece.rate },
          ...(piece.wrap === undefined ? {} : { wrap: { ...piece.wrap } }),
        })),
      } }),
    };
  }
  // Spreading an absent artifact produced `{}`, which is not an artifact and is not nothing either:
  // the field the author actually wrote was dropped without a word, and the refusal came one call
  // later from the identity check, naming `.artifact` — a field they had not typed.
  if (element.artifact === undefined) {
    throw new Error(`${element.id} is a ${element.kind} element with no artifact.`);
  }
  if (element.kind === "image") return { ...common, kind: "image", artifact: { ...element.artifact } };
  return {
    ...common,
    kind: "video",
    artifact: { ...element.artifact },
    sourceTime: {
      sourceFrameRate: { ...element.sourceTime.sourceFrameRate },
      sourceFrameCount: element.sourceTime.sourceFrameCount,
      pieces: element.sourceTime.pieces.map((piece) => ({
        target: { ...piece.target }, sourceAtStart: { ...piece.sourceAtStart }, rate: { ...piece.rate },
        ...(piece.wrap === undefined ? {} : { wrap: { ...piece.wrap } }),
      })),
    },
    ...(element.muted === undefined ? {} : { muted: element.muted }),
  };
}

function visualTrackContent(value: Omit<VisualTrack, "kind">): VisualTrack {
  if (!Array.isArray(value.items)) {
    throw new Error(`VisualTrack ${value.id} requires an items array.`);
  }
  return {
    kind: "visual",
    timelineId: value.timelineId,
    visualIr: value.visualIr,
    id: value.id,
    items: [...value.items]
      .map((item): VisualItem => {
        if (item === null || typeof item !== "object") {
          throw new Error(`VisualTrack ${value.id} contains an invalid Visual Item.`);
        }
        const common = {
          kind: item.kind,
          id: item.id,
          ...(item.subjectId === undefined ? {} : { subjectId: item.subjectId }),
          span: { ...item.span },
          ...(item.visibility === undefined ? {} : { visibility: item.visibility.map((span: FrameSpan) => ({ ...span })) }),
        } as const;
        if (item.kind === "present") {
          return { ...common, kind: "present", root: normalizeElement(item.root) };
        }
        if (item.kind === "adjustment") {
          return { ...common, kind: "adjustment", program: structuredClone(item.program) };
        }
        const invalid = item as { readonly id?: unknown; readonly kind?: unknown };
        const id = typeof invalid.id === "string" && invalid.id.length > 0 ? invalid.id : "unknown";
        throw new Error(`VisualTrack ${value.id}.${id} has invalid Visual Item kind ${String(invalid.kind)}.`);
      }),
  };
}

function audioTrackContent(value: Omit<AudioTrack, "kind">): AudioTrack {
  const signalKey = (reference: AudioSignalRef): string => `${reference.node}\u0000${reference.port}`;
  const nodeContent = (node: AudioGraphNode): AudioGraphNode => {
    if (node.kind === "mix") {
      return {
        kind: "mix",
        id: node.id,
        // A Mix input is a signal multiset: ordering has no audible meaning,
        // while repeated references remain repeated contributions.
        inputs: [...node.inputs].map((input) => ({ ...input }))
          .sort((left, right) => compareCodeUnits(signalKey(left), signalKey(right))),
      };
    }
    if (node.kind === "process") {
      return {
        kind: "process",
        id: node.id,
        inputs: Object.fromEntries(Object.entries(node.inputs)
          .sort(([left], [right]) => compareCodeUnits(left, right))
          .map(([port, input]) => [port, { ...input }])),
        program: structuredClone(node.program),
      };
    }
    return structuredClone(node);
  };
  return {
    kind: "audio",
    timelineId: value.timelineId,
    id: value.id,
    graph: {
      nodes: [...value.graph.nodes].map(nodeContent)
        .sort((left, right) => compareCodeUnits(left.id, right.id)),
      output: { ...value.graph.output },
    },
  };
}

export function audioSignal(node: string): AudioSignalRef {
  return { node, port: "signal" };
}

export function audioGraphFromClips(clips: readonly AudioClip[]): AudioSignalGraph {
  if (clips.length === 0) return { nodes: [{ kind: "silence", id: "silence" }], output: audioSignal("silence") };
  const ordered = [...clips].map((clip) => structuredClone(clip))
    .sort((left, right) => left.target.startSample - right.target.startSample || compareCodeUnits(left.id, right.id));
  const sources = ordered.map((clip, index) => ({
    kind: "source" as const,
    id: `source-${String(index + 1).padStart(4, "0")}`,
    clip,
  }));
  if (sources.length === 1) return { nodes: sources, output: audioSignal(sources[0]!.id) };
  const mix: AudioGraphNode = { kind: "mix", id: "mix", inputs: sources.map((source) => audioSignal(source.id)) };
  return { nodes: [...sources, mix], output: audioSignal(mix.id) };
}

export function audioTrackClips(track: AudioTrack): readonly AudioClip[] {
  return track.graph.nodes.flatMap((node) => node.kind === "source" ? [node.clip] : []);
}

export function sealVisualTrack(value: Omit<VisualTrack, "kind">): VisualTrack {
  return visualTrackContent(value);
}

/** Construct the common Present-only subset while keeping the terminal value on the unified item waist. */
export function sealPresentVisualTrack(
  value: Omit<VisualTrack, "kind" | "items"> & { readonly presents: readonly VisualPresentDraft[] },
): PresentVisualTrack {
  if (!Array.isArray(value.presents)) {
    throw new Error(`Present VisualTrack ${value.id} requires a presents array.`);
  }
  return visualTrackContent({
    timelineId: value.timelineId,
    visualIr: value.visualIr,
    id: value.id,
    items: value.presents.map((present, index) => {
      if (present === null || typeof present !== "object") {
        throw new Error(`Present VisualTrack ${value.id} contains an invalid Present at index ${index}.`);
      }
      const suppliedKind = (present as VisualPresentDraft & { readonly kind?: unknown }).kind;
      if (suppliedKind !== undefined && suppliedKind !== "present") {
        throw new Error(`Present VisualTrack ${value.id}.${present.id} received non-Present kind ${String(suppliedKind)}.`);
      }
      return { ...present, kind: "present" };
    }),
  }) as PresentVisualTrack;
}

export function visualPresents(track: VisualTrack): readonly VisualPresent[] {
  return track.items.filter((item): item is VisualPresent => item.kind === "present");
}

/** Structural children of one visual node, preserving each relation's semantic order. */
export function visualElementChildren(element: VisualElement): readonly VisualElement[] {
  if (element.kind === "box") return element.children;
  if (element.kind === "program") return element.slots.map((slot) => slot.element);
  if (element.kind === "mask") return [element.mask, element.content];
  return [];
}

/** Pre-order observation of one rooted visual tree. The returned array is derived, never identity. */
export function visualElements(root: VisualElement): readonly VisualElement[] {
  return [root, ...visualElementChildren(root).flatMap(visualElements)];
}

export function visualAdjustments(track: VisualTrack): readonly VisualAdjustment[] {
  return track.items.filter((item): item is VisualAdjustment => item.kind === "adjustment");
}

export function sealAudioTrack(value: Omit<AudioTrack, "kind">): AudioTrack {
  return audioTrackContent(value);
}

export function assertVisualTrackIdentity(track: VisualTrack, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (track === null || typeof track !== "object" || Array.isArray(track)) {
    throw new Error("VisualTrack is invalid.");
  }
  if (track.kind !== "visual") throw new Error("VisualTrack kind is invalid.");
  if (track.visualIr !== VISUAL_IR_V1) throw new Error("Unsupported VisualTrack visual IR.");
  assertNonEmpty(track.timelineId, "VisualTrack timelineId");
  if (timeline !== undefined && track.timelineId !== timeline.id) {
    throw new Error(`VisualTrack ${track.id} belongs to Timeline ${track.timelineId}, not ${timeline.id}.`);
  }
  assertNonEmpty(track.id, "VisualTrack id");
  if (!Array.isArray(track.items)) throw new Error(`VisualTrack ${track.id} items are invalid.`);
  const itemIds = new Set<string>();
  for (const item of track.items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`VisualTrack ${track.id} contains an invalid Visual Item.`);
    }
    if (itemIds.has(item.id)) throw new Error(`${track.id} has duplicate Visual Item ${item.id}.`);
    itemIds.add(item.id);
    if (item.kind === "present") assertPresent(item, timeline, track.id);
    else if (item.kind === "adjustment") assertAdjustment(item, timeline, track.id);
    else throw new Error(`${track.id}.${(item as { readonly id?: string }).id ?? "unknown"} has invalid Visual Item kind.`);
  }
}

export function assertAudioTrackIdentity(track: AudioTrack, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (track === null || typeof track !== "object" || Array.isArray(track)) {
    throw new Error("AudioTrack is invalid.");
  }
  if (track.kind !== "audio") throw new Error("AudioTrack kind is invalid.");
  assertNonEmpty(track.timelineId, "AudioTrack timelineId");
  if (timeline !== undefined && track.timelineId !== timeline.id) {
    throw new Error(`AudioTrack ${track.id} belongs to Timeline ${track.timelineId}, not ${timeline.id}.`);
  }
  assertNonEmpty(track.id, "AudioTrack id");
  const totalSamples = timeline === undefined
    ? Number.MAX_SAFE_INTEGER
    : timelineSampleFrames(timeline, 48_000);
  if (track.graph === null || typeof track.graph !== "object" || !Array.isArray(track.graph.nodes)) {
    throw new Error(`AudioTrack ${track.id} graph is invalid.`);
  }
  const nodes = new Map<string, AudioGraphNode>();
  const clipIds = new Set<string>();
  const references = new Map<string, readonly AudioSignalRef[]>();
  for (const node of track.graph.nodes) {
    assertNonEmpty(node.id, `${track.id} Audio node id`);
    if (nodes.has(node.id)) throw new Error(`${track.id} has duplicate Audio node ${node.id}.`);
    nodes.set(node.id, node);
    if (node.kind === "silence") {
      references.set(node.id, []);
      continue;
    }
    if (node.kind === "source") {
      references.set(node.id, []);
      const clip = node.clip;
    if (clipIds.has(clip.id)) throw new Error(`${track.id} has duplicate clip ${clip.id}.`);
    clipIds.add(clip.id);
    assertNonEmpty(clip.id, `${track.id} clip id`);
    if (clip.subjectId !== undefined) assertNonEmpty(clip.subjectId, `${track.id}.${clip.id} subjectId`);
    assertAudioArtifact(clip.artifact, `${track.id}.${clip.id}.artifact`);
    if (!Number.isSafeInteger(clip.target.startSample) || clip.target.startSample < 0
      || !Number.isSafeInteger(clip.target.endSampleExclusive)
      || clip.target.endSampleExclusive <= clip.target.startSample
      || clip.target.endSampleExclusive > totalSamples) {
      throw new Error(`${track.id}.${clip.id} target sample interval is outside Timeline.`);
    }
    assertAudioSourceTime(clip.sourceTime, clip.target.endSampleExclusive - clip.target.startSample,
      `${track.id}.${clip.id}.sourceTime`);
    if (!Number.isFinite(clip.gain) || clip.gain < 0) {
      throw new Error(`${track.id}.${clip.id} gain is invalid.`);
    }
    assertAudioLevelAutomation(clip, clip.target, totalSamples);
    const targetLength = clip.target.endSampleExclusive - clip.target.startSample;
    if (!Number.isSafeInteger(clip.fadeInSamples) || clip.fadeInSamples < 0 || clip.fadeInSamples > targetLength
      || !Number.isSafeInteger(clip.fadeOutSamples) || clip.fadeOutSamples < 0
      || clip.fadeOutSamples > targetLength) {
      throw new Error(`${track.id}.${clip.id} fades are invalid.`);
    }
      continue;
    }
    if (node.kind === "mix") {
      if (!Array.isArray(node.inputs) || node.inputs.length === 0) throw new Error(`${track.id}.${node.id} Mix has no inputs.`);
      references.set(node.id, node.inputs);
      continue;
    }
    if (node.kind !== "process" || node.inputs === null || typeof node.inputs !== "object"
      || node.inputs.signal === undefined) {
      throw new Error(`${track.id}.${node.id} Process is invalid.`);
    }
    assertAudioProcessProgram(node.program, `${track.id}.${node.id}.program`);
    references.set(node.id, Object.values(node.inputs));
  }
  const assertRef = (reference: AudioSignalRef, label: string): void => {
    if (reference?.port !== "signal" || !nodes.has(reference.node)) throw new Error(`${label} is invalid.`);
  };
  assertRef(track.graph.output, `${track.id}.graph.output`);
  for (const [node, inputs] of references) for (const [index, reference] of inputs.entries()) {
    assertRef(reference, `${track.id}.${node}.inputs.${index}`);
  }
  const state = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (state.get(id) === "visiting") throw new Error(`${track.id} Audio graph contains a cycle at ${id}.`);
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    reachable.add(id);
    for (const input of references.get(id) ?? []) visit(input.node);
    state.set(id, "visited");
  };
  visit(track.graph.output.node);
  if (reachable.size !== nodes.size) throw new Error(`${track.id} Audio graph contains unreachable nodes.`);
  }

function assertAudioSourceTimeRational(value: AudioSourceTimeRational, label: string, positive = false): void {
  if (!Number.isSafeInteger(value.numerator) || (positive ? value.numerator <= 0 : value.numerator < 0)
    || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
    throw new Error(`${label} is invalid.`);
  }
}

function compareAudioRational(value: AudioSourceTimeRational, integer: number): number {
  const difference = BigInt(value.numerator) - BigInt(integer) * BigInt(value.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function compareAudioSourceAtEnd(piece: AudioSourceTimePiece, integer: number): number {
  const length = piece.target.endSampleExclusive - piece.target.startSample;
  const numerator = BigInt(piece.sourceAtStart.numerator) * BigInt(piece.rate.denominator)
    + BigInt(length) * BigInt(piece.rate.numerator) * BigInt(piece.sourceAtStart.denominator);
  const denominator = BigInt(piece.sourceAtStart.denominator) * BigInt(piece.rate.denominator);
  const difference = numerator - BigInt(integer) * denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function assertAudioSourceTime(value: AudioSourceTimeMap, targetSamples: number, label: string): void {
  if (!Number.isSafeInteger(value.sourceSampleFrames) || value.sourceSampleFrames <= 0
    || !Array.isArray(value.pieces) || value.pieces.length === 0) throw new Error(`${label} is invalid.`);
  let previousEnd = 0;
  for (const [index, piece] of value.pieces.entries()) {
    const item = `${label}.pieces.${index}`;
    if (!Number.isSafeInteger(piece.target.startSample) || piece.target.startSample < previousEnd
      || !Number.isSafeInteger(piece.target.endSampleExclusive)
      || piece.target.endSampleExclusive <= piece.target.startSample
      || piece.target.endSampleExclusive > targetSamples) throw new Error(`${item}.target is invalid.`);
    assertAudioSourceTimeRational(piece.sourceAtStart, `${item}.sourceAtStart`);
    assertAudioSourceTimeRational(piece.rate, `${item}.rate`, true);
    if (piece.sourceAtStart.numerator % piece.sourceAtStart.denominator !== 0) {
      throw new Error(`${item}.sourceAtStart must resolve to an exact source-sample boundary.`);
    }
    if (piece.wrap === undefined) {
      const sourceEndNumerator = BigInt(piece.sourceAtStart.numerator) * BigInt(piece.rate.denominator)
        + BigInt(piece.target.endSampleExclusive - piece.target.startSample)
          * BigInt(piece.rate.numerator) * BigInt(piece.sourceAtStart.denominator);
      const sourceEndDenominator = BigInt(piece.sourceAtStart.denominator) * BigInt(piece.rate.denominator);
      if (sourceEndNumerator % sourceEndDenominator !== 0n) {
        throw new Error(`${item} must end on an exact source-sample boundary.`);
      }
      if (compareAudioRational(piece.sourceAtStart, value.sourceSampleFrames) >= 0
        || compareAudioSourceAtEnd(piece, value.sourceSampleFrames) > 0) {
        throw new Error(`${item} leaves the source domain.`);
      }
    } else if (!Number.isSafeInteger(piece.wrap.startSample) || piece.wrap.startSample < 0
      || !Number.isSafeInteger(piece.wrap.endSampleExclusive)
      || piece.wrap.endSampleExclusive <= piece.wrap.startSample
      || piece.wrap.endSampleExclusive > value.sourceSampleFrames
      || compareAudioRational(piece.sourceAtStart, piece.wrap.startSample) < 0
      || compareAudioRational(piece.sourceAtStart, piece.wrap.endSampleExclusive) >= 0) {
      throw new Error(`${item}.wrap is invalid.`);
    }
    previousEnd = piece.target.endSampleExclusive;
  }
}

function visualScopeContent(value: VisualScope): VisualScope {
  return {
    members: [...value.members].map((member): VisualScopeMember => member.kind === "track"
      ? { kind: "track", id: member.id, track: structuredClone(member.track) }
      : { kind: "stack", id: member.id, scope: visualScopeContent(member.scope) }),
  };
}

export function sealVisualScope(value: VisualScope): VisualScope {
  return visualScopeContent(value);
}

export function visualScopeTracks(scope: VisualScope): VisualTrack[] {
  return scope.members.flatMap((member) => member.kind === "track"
    ? [member.track]
    : visualScopeTracks(member.scope));
}

export function visualScopeTrackOccurrences(
  scope: VisualScope,
  parentPath: readonly string[] = [],
): VisualTrackOccurrence[] {
  return scope.members.flatMap((member) => {
    const path = [...parentPath, member.id];
    return member.kind === "track"
      ? [{ path, member }]
      : visualScopeTrackOccurrences(member.scope, path);
  });
}

function compositionContent(value: Composition): Composition {
  return {
    id: value.id,
    canvas: { ...value.canvas },
    visual: visualScopeContent(value.visual),
    audio: [...value.audio]
      .map((track) => audioTrackContent({ timelineId: track.timelineId, id: track.id, graph: track.graph }))
      .sort((left, right) => compareCodeUnits(canonicalStringify(left), canonicalStringify(right))),
  };
}

export function sealComposition(value: Composition): Composition {
  return compositionContent(value);
}

function assertVisualScope(
  scope: VisualScope,
  timeline: Timeline | undefined,
  label: string,
): void {
  if (scope === null || typeof scope !== "object" || !Array.isArray(scope.members)) {
    throw new Error(`${label} is invalid.`);
  }
  const memberIds = new Set<string>();
  for (const [index, member] of scope.members.entries()) {
    const memberLabel = `${label}.members.${index}`;
    if (member === null || typeof member !== "object") throw new Error(`${memberLabel} is invalid.`);
    assertNonEmpty(member.id, `${memberLabel} id`);
    if (memberIds.has(member.id)) throw new Error(`${label} contains duplicate member id ${member.id}.`);
    memberIds.add(member.id);
    if (member.kind === "track") {
      assertVisualTrackIdentity(member.track, timeline);
      continue;
    }
    if (member.kind !== "stack") throw new Error(`${memberLabel}.kind is invalid.`);
    assertVisualScope(member.scope, timeline, `${memberLabel}.scope`);
    if (!visualScopeTracks(member.scope).some((track) => track.items.some((item) => item.kind === "present"))) {
      throw new Error(`${memberLabel} must contain a source-owning Present.`);
    }
  }
}

export function assertVisualScopeIdentity(scope: VisualScope, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  assertVisualScope(scope, timeline, "VisualScope");
}

export function assertCompositionIdentity(composition: Composition, timeline?: Timeline): void {
  if (composition === null || typeof composition !== "object" || Array.isArray(composition)) {
    throw new Error("Composition is invalid.");
  }
  assertNonEmpty(composition.id, "Composition id");
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (
    composition.canvas === null
    || typeof composition.canvas !== "object"
    || Array.isArray(composition.canvas)
    || !Number.isSafeInteger(composition.canvas.width)
    || composition.canvas.width <= 0
    || !Number.isSafeInteger(composition.canvas.height)
    || composition.canvas.height <= 0
    || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(composition.canvas.clearColor)
  ) {
    throw new Error("Composition canvas is invalid.");
  }
  assertVisualScope(composition.visual, timeline, "Composition.visual");
  if (!Array.isArray(composition.audio)) throw new Error("Composition.audio is invalid.");
  for (const track of composition.audio) {
    assertAudioTrackIdentity(track, timeline);
  }
}
