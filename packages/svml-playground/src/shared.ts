/**
 * The only module imported by both the Node interpreter and the browser. It
 * declares types alone so the browser never pulls a Node dependency through it.
 */

/** UTF-16 offsets into the exact source text carried by the snapshot. */
export type Range = { readonly start: number; readonly end: number };

/**
 * One Visual Present, which is the whole of what a Track says about a picture:
 * an identity, a span and where it sits in the stack. The box it paints into is
 * measured from the rendered picture rather than restated here, because motion
 * moves it and only the picture knows where it ended up.
 */
export type Clip = {
  /** The Present's own id, identical to the preview's data-hypit-present-id. */
  readonly id: string;
  /** The authored id this Present is named after, when it names one. */
  readonly authoredId: string;
  /** The Script marker that placed it, when something said put it there. */
  readonly markerId?: string;
  readonly label: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** Where that authored tag was written. */
  readonly elementRange?: Range;
  /**
   * What is actually on screen for this clip. Absent means the material the
   * Source names; otherwise the shot has not been made and this says what was
   * put there instead.
   */
  readonly standIn?: "picture" | "black";
  readonly stackOrder: number;
};

export type Track = {
  readonly id: string;
  readonly label: string;
  /** Render order in the timeline; 0 is the top row. */
  readonly row: number;
  readonly clips: readonly Clip[];
  /** Capabilities this machine could not answer, when the Track has no picture. */
  readonly waiting?: readonly string[];
  /**
   * Where this Track's own picture came from. `made` is the material the Source
   * names; `stand-in` is a picture it named for a shot nobody has made; `black`
   * is neither. A Track drawn from more than one is reported by its weakest.
   */
  readonly source: "made" | "stand-in" | "black" | "waiting";
  /** Whether this Track's times were supplied or estimated. */
  readonly timing: "measured" | "estimated";
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
  readonly source: {
    readonly path: string;
    readonly text: string;
    readonly digest: string;
  };
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
  /** The Tracks, compiled into the document the renderer photographs. */
  readonly preview: { readonly kind: "hyperframes"; readonly srcdoc: string };
  readonly provenance: {
    /** Where the timeline came from. The frame domain always shares its source. */
    readonly timing: "measured" | "estimated";
    /**
     * Whether the picture is real material. `partial` when some elements have
     * their footage and others are still placeholders, which is the normal
     * state part-way through a production.
     */
    readonly picture: "measured" | "estimated";
    /** What the badges above are standing for, in one sentence. */
    readonly note: string;
  };
  /**
   * Material an author supplied that the preview will not show, and why. A
   * placeholder next to a file they know exists reads as a bug otherwise.
   */
  readonly refused: readonly { readonly output: string; readonly reason: string }[];
  /**
   * Why a Track has no value. A Producer that failed already said why, and a
   * plan that produced nothing knows which output it was; without this every
   * cause reads as the same silent absence.
   */
  readonly errors: readonly string[];
};

export type PlaygroundFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
