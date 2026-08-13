/**
 * The only module imported by both the Node interpreter and the browser. It
 * declares types alone so the browser never pulls a Node dependency through it.
 */

/** UTF-16 offsets into the exact source text carried by the snapshot. */
export type Range = { readonly start: number; readonly end: number };

export type Rect = {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
};

/** Whether a number was measured by the real pipeline or estimated from Script text. */
export type Provenance = "measured" | "estimated";

export type PreviewMode = "real" | "synthetic";

export type ClipKind = "speech" | "media";

export type ClipBinding =
  | { readonly kind: "program" }
  | { readonly kind: "selection"; readonly id: string; readonly occurrence: number }
  | { readonly kind: "segment"; readonly id: string }
  | { readonly kind: "moment"; readonly id: string; readonly occurrence: number };

export type Clip = {
  /** MediaItemProgram.id — identical to the preview's data-svml-present-id. */
  readonly id: string;
  /** The authored element id this clip was realized from. */
  readonly authoredId: string;
  readonly label: string;
  readonly kind: ClipKind;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** The <media-track:Item> or <speech:Take> element span in the source. */
  readonly elementRange: Range;
  /** The Script marker span this clip is bound to, when it is bound to one. */
  readonly bindingRange?: Range;
  readonly binding: ClipBinding;
  /** Placement Frame in canvas pixels, before padding and before motion. */
  readonly frame: Rect;
  /** frame inset by presentation padding — the box the material paints into. */
  readonly contentFrame: Rect;
  /** Motion animates the box across the span, so frame is exact only mid-span. */
  readonly animated: boolean;
  /** No real material backed this item, so a paint placeholder was substituted. */
  readonly placeholder: boolean;
  readonly stackOrder: number;
};

export type Track = {
  readonly id: string;
  readonly label: string;
  readonly kind: ClipKind;
  /** Render order in the timeline; 0 is the top row. */
  readonly row: number;
  readonly clips: readonly Clip[];
};

export type SourceElement = {
  /** Authored id attribute, or a synthesized ordinal when the element has none. */
  readonly id: string;
  readonly tag: string;
  readonly range: Range;
  readonly children: readonly {
    readonly tag: string;
    readonly range: Range;
    readonly id?: string;
  }[];
};

export type ScriptMap = {
  readonly recordId: string;
  readonly range: Range;
  readonly selections: readonly {
    readonly id: string;
    /** How many Selections enclose this one. Nesting is what depth means. */
    readonly depth: number;
    readonly occurrences: readonly {
      readonly occurrence: number;
      readonly open: Range;
      readonly close: Range;
    }[];
  }[];
  readonly segments: readonly {
    readonly id: string;
    /** Always 0: a Segment is the outermost range the Script declares. */
    readonly depth: number;
    readonly range: Range;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly occurrences: readonly { readonly occurrence: number; readonly range: Range }[];
  }[];
  /**
   * Spoken words placed on the timeline. Whether these are measured or estimated
   * is the snapshot's `provenance.timing`.
   */
  readonly tokens: readonly {
    readonly id: string;
    readonly range: Range;
    readonly startFrame: number;
    readonly endFrame: number;
  }[];
};

export type PlaygroundSnapshot = {
  readonly revision: number;
  readonly mode: PreviewMode;
  readonly source: {
    readonly path: string;
    readonly text: string;
    readonly digest: string;
  };
  /** Top-level elements in document order, for code-pane hit testing. */
  readonly elements: readonly SourceElement[];
  readonly script?: ScriptMap;
  readonly space: {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly clearColor: string;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
    readonly durationSec: number;
  };
  readonly tracks: readonly Track[];
  /**
   * The picture, ready to mount. Real material is the base layer rather than the
   * whole picture: the Tracks above it have not been rendered into that file, so
   * they are composited over it exactly as they are in `hyperframes` mode.
   */
  readonly preview:
    | { readonly kind: "hyperframes"; readonly srcdoc: string }
    | {
      readonly kind: "video";
      readonly url: string;
      readonly mediaType: string;
      /** The overlay Tracks, on a transparent canvas. */
      readonly overlay: string;
    };
  readonly provenance: {
    /** Where the timeline came from. The frame domain always shares its source. */
    readonly timing: Provenance;
    /**
     * Whether the picture is real material. `partial` when some elements have
     * their footage and others are still placeholders, which is the normal
     * state part-way through a production.
     */
    readonly picture: Provenance | "partial";
    /** What the badges above are standing for, in one sentence. */
    readonly note: string;
  };
  /**
   * Material an author supplied that the preview will not show, and why. A
   * placeholder next to a file they know exists reads as a bug otherwise.
   */
  readonly refused: readonly { readonly output: string; readonly reason: string }[];
  /** Elements the interpreter read but did not project, in document order. */
  readonly unsupported: readonly {
    readonly tag: string;
    readonly range: Range;
  }[];
};

export type PlaygroundFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
