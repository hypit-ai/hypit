import type { AudioLevelAutomation } from "./audio-level-automation.js";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";
import type { FrameSpan, Timeline } from "@hypit/timeline";
import type {
  CompositableSurfaceRef,
  FontArtifactRef,
  PictureInterpretation,
  PreparedAudioSource,
  PreparedVisualSource,
} from "@hypit/media";
import type { ExactTemporalValue, TemporalMap, TemporalRange } from "@hypit/temporal";

export type VisualEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type VisualElementBase = {
  readonly id: string;
};

/**
 * A renderer-interpreted local program. Its format, payload and dependency
 * meaning belong to its rendering package; artifacts are only the generic
 * resource closure required by graph execution.
 */
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
  /** Exact ordered fallback faces. Typed text never depends on environment fonts. */
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
    readonly state: {
      readonly opacity?: number;
      readonly transform?: {
        readonly translateXPx: number;
        readonly translateYPx: number;
        readonly scale: number;
        readonly rotateDeg: number;
        readonly skewXDeg: number;
        readonly skewYDeg: number;
      };
      readonly blurPx?: number;
      readonly color?: string;
      readonly clipInsetPercent?: {
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
        readonly left: number;
      };
    };
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

export type VisualMediaElement =
  | (VisualElementBase & {
      readonly kind: "image";
      readonly artifact: BlobRef;
      readonly picture: PictureInterpretation;
    })
  | (VisualElementBase & {
      readonly kind: "video";
      /** Selected source signal; decoding remains a terminal Provider concern. */
      readonly source: PreparedVisualSource;
      /** Exact occurrence-local to source-presentation relation. */
      readonly sampling: TemporalMap;
      readonly muted?: boolean;
    });

/** A package-materialized visual surface with content-bound compositing metadata, not an untyped media guess. */
export type VisualSurfaceElement = VisualElementBase & {
  readonly kind: "surface";
  readonly surface: CompositableSurfaceRef;
  /** Required exactly when surface.timing is frames; absent for a still Surface. */
  readonly sampling?: TemporalMap;
};

/**
 * Structural elements and explicit renderer programs compose in one owned tree.
 *
 * A Present holds exactly one recursive root. **Position is measured from that parent, not from the Canvas.**
 * A component that computes its layout in Canvas pixels and then nests its elements has to subtract the parent's own origin,
 * or every child lands offset by it — which draws without complaint and is wrong by exactly the
 * distance the parent sits from the corner.
 */
export type VisualElement = VisualProgramElement | VisualMaskElement | VisualTextElement | VisualTextFlowElement | VisualPathTextElement | VisualMediaElement | VisualSurfaceElement;

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

/**
 * A derived picture contribution with named, independently timed inputs.
 *
 * Inputs are owned values rather than graph references, so the recursive structure cannot contain
 * cycles or depend on a central visual-node registry. The programme owns the meaning of its port
 * names; each input keeps its own absolute span, animation origin and media sampling relation.
 */
export type VisualProcess = VisualItemBase & {
  readonly kind: "process";
  readonly inputs: readonly {
    readonly name: string;
    readonly contribution: VisualContribution;
  }[];
  readonly effect: VisualProcessEffect;
};

export type VisualContribution = VisualPresent | VisualProcess;

/** A source-free transformation of the Picture accumulated below this stack position. */
export type VisualAdjustment = VisualItemBase & {
  readonly kind: "adjustment";
  readonly program: VisualProgram;
};

export type VisualItem = VisualContribution | VisualAdjustment;

/** Narrow construction input for the common source-owning subset. */
export type VisualPresentDraft = Omit<VisualPresent, "kind">;

export type VisualTrack = {
  readonly kind: "visual";
  /** Timeline identity this terminal placement was rendered against. */
  readonly timelineId: string;
  readonly id: string;
  /** Author-owned contributions that Composition interleaves in their containing VisualScope. */
  readonly items: readonly VisualItem[];
};

/** The ordinary source-owning subset returned by Present component constructors. */
export type PresentVisualTrack = Omit<VisualTrack, "items"> & {
  readonly items: readonly VisualPresent[];
};

export type AudioClip = AudioLevelAutomation & {
  readonly id: string;
  /** Optional domain entity implemented by this renderer Clip. */
  readonly subjectId?: string;
  /** Selected audio signal only; visual and unrelated container facts do not enter the audio graph. */
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
  /** Exact absolute audible placement. A terminal audio compiler chooses its sample boundaries. */
  readonly target: TemporalRange;
  /** Exact Clip-local target-to-prepared relation. */
  readonly sampling: TemporalMap;
  /** Omission means ordinary point sampling; a value explicitly selects another reconstruction. */
  readonly reconstruction?: AudioReconstructionProgram;
  readonly gain: number;
  readonly fadeIn: ExactTemporalValue;
  readonly fadeOut: ExactTemporalValue;
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

/**
 * Package-owned reconstruction of one sampled source occurrence.
 *
 * TemporalMap continues to say which source position belongs to each target
 * position. This programme says how those positions become an audible signal;
 * renderers must never infer it from the shape or rate of the Map.
 */
export type AudioReconstructionProgram = {
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

/** One renderer-neutral contract for a package-owned, named-input Picture operation. */
export type VisualProcessEffect = {
  readonly inputs: readonly string[];
  readonly program: VisualProgram;
};

export type VisualScopeProcessMember = {
  readonly kind: "process";
  /** Stable identity of this Process occurrence inside its parent VisualScope. */
  readonly id: string;
  readonly inputs: readonly {
    readonly name: string;
    readonly scope: VisualScope;
  }[];
  readonly effect: VisualProcessEffect;
};

export type VisualScopeMember = VisualScopeTrackMember | VisualScopeStackMember | VisualScopeProcessMember;

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

export type VisualComposition = {
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    /** Structural clear color beneath every VisualTrack. */
    readonly clearColor: string;
  };
  readonly root: VisualScope;
};

export type AudioComposition = {
  /** Film-level audio is the additive sum of already closed AudioTrack outputs. */
  readonly contributions: readonly AudioTrack[];
};

/** One synchronized audiovisual work whose two terminal programmes share one Timeline. */
export type Composition = {
  readonly id: string;
  /** The one absolute clock shared by this Composition's visual and audio programmes. */
  readonly timeline: Timeline;
  readonly visual: VisualComposition;
  readonly audio: AudioComposition;
};

/** Construction input: Film supplies the Timeline once; the sealed value owns it thereafter. */
export type CompositionDraft = Omit<Composition, "timeline">;
