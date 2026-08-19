import type { FrameSpan } from "@hypit/composition";
import type { FontArtifactRef } from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";

/** Identity of one notepad list, sealed by the Surface before anything is scheduled. */
export type NotepadHeader = {
  readonly id: string;
};

export type NotepadRowMark = "none" | "circle";

/** One row of the list: the number it prints, the copy it writes, and its optional annotation. */
export type NotepadRowSpec = {
  readonly id: string;
  readonly rank: number;
  readonly label: string;
  readonly mark: NotepadRowMark;
  readonly stackingOrder?: number;
};

/** Structural half of a Row whose visible copy arrives on a Text graph edge. */
export type NotepadRowShell = Omit<NotepadRowSpec, "label">;

export type NotepadRowSpecSet = {
  readonly rows: readonly NotepadRowSpec[];
};

/** The title, written as one italic lead run followed by one emphasized run. */
export type NotepadTitleSpec = {
  readonly lead: string;
  readonly emphasis: string;
};

export type NotepadTitleShell = {
  readonly lead?: string;
  readonly emphasis?: string;
};

export type NotepadShadow = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blurPx: number;
  readonly color: string;
};

/** Where and how the title is set once the paper is on screen. */
export type NotepadTitlePaint = {
  readonly xFraction: number;
  readonly yFraction: number;
  readonly widthFraction: number;
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly trackingPx: number;
  readonly color: string;
  readonly underlinePx: number;
  readonly shadow?: NotepadShadow;
};

export type NotepadRowPaint = {
  readonly xFraction: number;
  readonly topFraction: number;
  readonly widthFraction: number;
  readonly gapPx: number;
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly trackingPx: number;
  readonly color: string;
  readonly numberWidthPx: number;
};

export type NotepadMarkPaint = {
  readonly color: string;
  readonly strokeWidthPx: number;
  readonly padXPx: number;
  readonly padYPx: number;
  readonly rotateDeg: number;
  readonly frames: number;
  /** Mean glyph advance of the row face, as a fraction of the row size. */
  readonly advance: number;
};

export type NotepadTypingStyle = {
  readonly titleFramesPerCharacter: number;
  readonly rowFramesPerCharacter: number;
};

export type NotepadStacking = {
  readonly surface: number;
  readonly title: number;
  readonly row: number;
  readonly mark: number;
};

/**
 * One notepad list Style: the paper treatment, the two title paints, the row
 * paint, the annotation and the typing rhythm, plus the three exact faces the
 * composition sets its copy in.
 */
export type NotepadStyle = {
  readonly leadFonts: readonly FontArtifactRef[];
  readonly emphasisFonts: readonly FontArtifactRef[];
  readonly rowFonts: readonly FontArtifactRef[];
  readonly numberFonts: readonly FontArtifactRef[];
  readonly surfaceFit: "contain" | "cover";
  readonly title: NotepadTitlePaint;
  readonly opening: NotepadTitlePaint;
  readonly row: NotepadRowPaint;
  readonly mark: NotepadMarkPaint;
  readonly typing: NotepadTypingStyle;
  readonly stacking: NotepadStacking;
};

export type NotepadRowEntry = {
  readonly rowId: string;
  readonly triggerFrame: number;
};

/**
 * The resolved timing of one notepad list: every window the paper is on screen
 * for, the optional title-only opening window, the frame each row is written
 * at, and the frame the list settles on.
 */
export type NotepadSchedule = {
  readonly id: string;
  readonly windows: readonly FrameSpan[];
  readonly opening?: FrameSpan;
  readonly terminalFrame: number;
  readonly entries: readonly NotepadRowEntry[];
};

export type NotepadProgram = {
  readonly id: string;
  readonly frame: SpatialFrame;
  readonly surface: BlobRef;
  readonly schedule: NotepadSchedule;
  readonly style: NotepadStyle;
  readonly title: NotepadTitleSpec;
  readonly rows: readonly NotepadRowSpec[];
};
