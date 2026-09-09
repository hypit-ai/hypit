import { canonicalStringify, isResourceId } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";

import {
  assertVisualStyleV1,
  VISUAL_IR_V1,
} from "@hypit/visual-ir";
import {
  assertProgramSpaceIdentity,
  programSpaceFrameCount,
  programSpaceSampleFrames,
} from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
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
  readonly parent?: string;
  readonly order: number;
  readonly style: readonly VisualStyleDeclaration[];
  readonly attributes?: readonly VisualAttribute[];
  readonly animation?: VisualAnimation;
};

export type VisualBoxElement = VisualElementBase & {
  readonly kind: "box";
};

/** A renderer-interpreted local program. Its format and payload belong to its rendering package. */
export type VisualProgramElement = VisualElementBase & {
  readonly kind: "program";
  readonly program: {
    readonly format: string;
    readonly payload: { readonly [key: string]: CanonicalValue };
    readonly artifacts: readonly BlobRef[];
  };
};

/** A strictly local two-input mask. Both roots are direct owned children in the same Present. */
export type VisualMaskElement = VisualElementBase & {
  readonly kind: "mask";
  readonly mode: "alpha" | "luminance";
  readonly maskElement: string;
  readonly contentElement: string;
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
  /** Exact frame-domain mapping for timed media. */
  readonly sampling?: VisualTimedSampling;
  readonly muted?: boolean;
};

/** A package-materialized visual surface with content-bound compositing metadata, not an untyped media guess. */
export type VisualSurfaceElement = VisualElementBase & {
  readonly kind: "surface";
  readonly surface: CompositableSurfaceRef;
  readonly sampling?: VisualTimedSampling;
};

/**
 * Structural elements and explicit renderer programs compose in one owned tree.
 *
 * A Present holds exactly one root; everything else names a `parent`, which can be a box,
 * mask or program. **Position is measured from that parent, not from the Canvas.** A component that computes
 * its layout in Canvas pixels and then nests its elements has to subtract the parent's own origin,
 * or every child lands offset by it — which draws without complaint and is wrong by exactly the
 * distance the parent sits from the corner.
 */
export type VisualElement = VisualBoxElement | VisualProgramElement | VisualMaskElement | VisualTextElement | VisualTextFlowElement | VisualPathTextElement | VisualMediaElement | VisualSurfaceElement;

export type VisualPresent = {
  readonly id: string;
  /** Optional domain entity implemented by this renderer Present. */
  readonly subjectId?: string;
  readonly span: FrameSpan;
  /** Absolute paint position for this Present, not for its authoring Track. */
  readonly stacking: {
    readonly order: number;
    readonly tieBreak: string;
  };
  readonly elements: readonly VisualElement[];
};

export type VisualTrack = {
  readonly kind: "visual";
  /** ProgramSpace identity this terminal placement was rendered against. */
  readonly programSpaceId: string;
  /** The one terminal visual language shared by official video components. */
  readonly visualIr: typeof VISUAL_IR_V1;
  readonly id: string;
  /** Author-owned contributions that Composition may interleave by absolute z. */
  readonly presents: readonly VisualPresent[];
};

export type AudioClip = {
  readonly id: string;
  /** Optional domain entity implemented by this renderer Clip. */
  readonly subjectId?: string;
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
  readonly kind: "audio";
  /** ProgramSpace identity this terminal placement was rendered against. */
  readonly programSpaceId: string;
  readonly id: string;
  readonly clips: readonly AudioClip[];
};

export type Track = VisualTrack | AudioTrack;

export type Composition = {
  readonly id: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    /** Structural clear color beneath every VisualTrack. */
    readonly clearColor: string;
  };
  readonly tracks: readonly Track[];
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
    throw new Error(`${label} is outside ProgramSpace.`);
  }
}

function assertMediaArtifact(artifact: BlobRef, label: string): void {
  if (
    artifact.kind !== "blob"
    || !isResourceId(artifact.resource)
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
    || !isResourceId(artifact.resource)
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

function assertPresent(present: VisualPresent, programSpace: ProgramSpace | undefined, trackId: string): void {
  const totalFrames = programSpace === undefined ? Number.MAX_SAFE_INTEGER : programSpaceFrameCount(programSpace);
  assertNonEmpty(present.id, `${trackId} Present id`);
  if (present.subjectId !== undefined) assertNonEmpty(present.subjectId, `${trackId}.${present.id} subjectId`);
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
    if (element.kind === "program") {
      assertNonEmpty(element.program.format, `${element.id}.program.format`);
      if (element.program.payload === null || typeof element.program.payload !== "object" || Array.isArray(element.program.payload)) throw new Error("Visual program payload must be an object.");
      canonicalStringify(element.program.payload);
      for (const artifact of element.program.artifacts) assertMediaArtifact(artifact, `${element.id}.program.artifacts`);
    }
    if (element.kind === "image" || element.kind === "video") {
      assertMediaArtifact(element.artifact, `${trackId}.${present.id}.${element.id}.artifact`);
      if (!element.artifact.mediaType.startsWith(`${element.kind}/`)) {
        throw new Error(`${trackId}.${present.id}.${element.id} media kind does not match its Artifact.`);
      }
      if (element.kind === "image" && element.sampling !== undefined) {
        throw new Error(`${trackId}.${present.id}.${element.id} cannot sample a durationless image.`);
      }
      if (element.sampling !== undefined) {
        if (element.animation !== undefined) {
          throw new Error(`${trackId}.${present.id}.${element.id} sampling motion must live on an owned wrapper.`);
        }
        assertSampling(element.sampling, present.span.endFrameExclusive - present.span.startFrame,
          `${trackId}.${present.id}.${element.id}.sampling`);
      }
    }
    if (element.kind === "text") {
      const label = `${trackId}.${present.id}.${element.id}`;
      assertExactFonts(element.fonts, `${label}.fonts`);
      const ownedFontStyles = new Set(["font", "font-family", "font-style", "font-synthesis", "font-weight"]);
      if (element.style.some((declaration) => ownedFontStyles.has(declaration.name))) {
        throw new Error(`${label} exact fonts conflict with a raw font style.`);
      }
      for (const [index, paint] of (element.paints ?? []).entries()) {
        assertTextPaint(paint, `${label}.paints.${index}`);
        // Box Paint decorates a laid-out run, and this element has no layout to decorate.
        if (paint.kind === "box") throw new Error(`${label}.paints.${index} is Box Paint on a plain text element.`);
      }
      // Two ways to say the same thing render twice: the declared Paint draws the glyph, and the
      // style would draw it again underneath.
      const paintedStyles = new Set(["-webkit-text-stroke", "-webkit-text-stroke-color", "-webkit-text-stroke-width", "paint-order"]);
      if (element.paints !== undefined && element.style.some((declaration) => paintedStyles.has(declaration.name))) {
        throw new Error(`${label} declares glyph Paint beside a raw stroke style.`);
      }
    }
    if (element.kind === "text-flow" || element.kind === "path-text") {
      const label = `${trackId}.${present.id}.${element.id}`;
      assertTextDocument(element.document, element.typography, `${label}.document`);
      assertTypography(element.typography, `${label}.typography`);
      const boxKeys = new Set<string>();
      for (const [index, paint] of element.paints.entries()) {
        assertTextPaint(paint, `${label}.paints.${index}`);
        if (paint.kind === "box") {
          const key = `${paint.target}:${paint.continuity}`;
          if (boxKeys.has(key)) throw new Error(`${label} repeats Box Paint ${key}.`);
          boxKeys.add(key);
        }
      }
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
    if (element.kind === "mask") {
      if (!["alpha", "luminance"].includes(element.mode)
        || element.maskElement === element.contentElement) {
        throw new Error(`${trackId}.${present.id}.${element.id} has an invalid local mask.`);
      }
    }
  }
  if (roots.length !== 1) throw new Error(`${trackId}.${present.id} must contain exactly one root element.`);
  for (const element of present.elements) {
    if (element.parent !== undefined && !elements.has(element.parent)) {
      throw new Error(`${trackId}.${present.id}.${element.id} references a foreign parent.`);
    }
    if (element.parent !== undefined && !["box", "mask", "program"].includes(elements.get(element.parent)?.kind ?? "")) {
      throw new Error(`${trackId}.${present.id}.${element.id} must have a box, mask or program parent.`);
    }
    const visited = new Set<string>();
    let cursor: VisualElement | undefined = element;
    while (cursor?.parent !== undefined) {
      if (visited.has(cursor.id)) throw new Error(`${trackId}.${present.id} contains an element cycle.`);
      visited.add(cursor.id);
      cursor = elements.get(cursor.parent);
    }
  }
  for (const element of present.elements) {
    if (element.kind !== "mask") continue;
    const direct = present.elements.filter((candidate) => candidate.parent === element.id);
    if (direct.length !== 2
      || !direct.some((candidate) => candidate.id === element.maskElement)
      || !direct.some((candidate) => candidate.id === element.contentElement)) {
      throw new Error(`${trackId}.${present.id}.${element.id} must own exactly its declared mask and content roots.`);
    }
    const maskRoot = direct.find((candidate) => candidate.id === element.maskElement)!;
    if (!["text", "text-flow", "path-text", "image", "surface"].includes(maskRoot.kind)
      || (maskRoot.kind === "surface" && maskRoot.surface.timing.kind !== "still")
      || present.elements.some((candidate) => candidate.parent === maskRoot.id)) {
      throw new Error(`${trackId}.${present.id}.${element.id} mask source must be one terminal owned text, image or still Surface.`);
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
  if (element.kind === "program") return { ...common, kind: "program", program: structuredClone(element.program) };
  if (element.kind === "mask") return {
    ...common,
    kind: "mask",
    mode: element.mode,
    maskElement: element.maskElement,
    contentElement: element.contentElement,
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
  // Spreading an absent artifact produced `{}`, which is not an artifact and is not nothing either:
  // the field the author actually wrote was dropped without a word, and the refusal came one call
  // later from the identity check, naming `.artifact` — a field they had not typed.
  if (element.artifact === undefined) {
    throw new Error(`${element.id} is a ${element.kind} element with no artifact.`);
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
    ...(element.muted === undefined ? {} : { muted: element.muted }),
  };
}

function visualTrackContent(value: Omit<VisualTrack, "kind">): VisualTrack {
  return {
    kind: "visual",
    programSpaceId: value.programSpaceId,
    visualIr: value.visualIr,
    id: value.id,
    presents: [...value.presents]
      .map((present) => ({
        id: present.id,
        ...(present.subjectId === undefined ? {} : { subjectId: present.subjectId }),
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

function audioTrackContent(value: Omit<AudioTrack, "kind">): AudioTrack {
  return {
    kind: "audio",
    programSpaceId: value.programSpaceId,
    id: value.id,
    clips: [...value.clips]
      .map((clip) => ({
        id: clip.id,
        ...(clip.subjectId === undefined ? {} : { subjectId: clip.subjectId }),
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

export function sealVisualTrack(value: Omit<VisualTrack, "kind">): VisualTrack {
  return visualTrackContent(value);
}

export function sealAudioTrack(value: Omit<AudioTrack, "kind">): AudioTrack {
  return audioTrackContent(value);
}

export function assertVisualTrackIdentity(track: VisualTrack, programSpace?: ProgramSpace): void {
  if (programSpace !== undefined) assertProgramSpaceIdentity(programSpace);
  if (track.kind !== "visual") throw new Error("VisualTrack kind is invalid.");
  if (track.visualIr !== VISUAL_IR_V1) throw new Error("Unsupported VisualTrack visual IR.");
  assertNonEmpty(track.programSpaceId, "VisualTrack programSpaceId");
  if (programSpace !== undefined && track.programSpaceId !== programSpace.id) {
    throw new Error(`VisualTrack ${track.id} belongs to ProgramSpace ${track.programSpaceId}, not ${programSpace.id}.`);
  }
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
  if (track.kind !== "audio") throw new Error("AudioTrack kind is invalid.");
  assertNonEmpty(track.programSpaceId, "AudioTrack programSpaceId");
  if (programSpace !== undefined && track.programSpaceId !== programSpace.id) {
    throw new Error(`AudioTrack ${track.id} belongs to ProgramSpace ${track.programSpaceId}, not ${programSpace.id}.`);
  }
  assertNonEmpty(track.id, "AudioTrack id");
  const totalSamples = programSpace === undefined
    ? Number.MAX_SAFE_INTEGER
    : programSpaceSampleFrames(programSpace, 48_000);
  const clipIds = new Set<string>();
  for (const clip of track.clips) {
    if (clipIds.has(clip.id)) throw new Error(`${track.id} has duplicate clip ${clip.id}.`);
    clipIds.add(clip.id);
    assertNonEmpty(clip.id, `${track.id} clip id`);
    if (clip.subjectId !== undefined) assertNonEmpty(clip.subjectId, `${track.id}.${clip.id} subjectId`);
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
  return `${track.kind}\u0000${track.id}`;
}

function compositionContent(value: Composition): Composition {
  return {
    id: value.id,
    canvas: { ...value.canvas },
    tracks: [...value.tracks].map((track) => structuredClone(track)).sort((a, b) => trackKey(a).localeCompare(trackKey(b))),
  };
}

export function sealComposition(value: Composition): Composition {
  return compositionContent(value);
}

export function assertCompositionIdentity(composition: Composition, programSpace?: ProgramSpace): void {
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
    if (track.kind === "visual") {
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
