/** The discrete sampling clock shared by one authored Timeline and its material. */
export type Clock = {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
};

/** One complete, content-independent absolute frame domain. */
export type Timeline = Clock & {
  /** Author-visible identity of this film time axis. */
  readonly id: string;
  /** Boundary after the final rendered frame. */
  readonly frameCount: number;
};

/** A half-open interval on one finite frame domain. */
export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
