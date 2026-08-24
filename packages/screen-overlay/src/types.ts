import type { FrameSpan } from "@hypit/composition";

export type FlashOverlay = {
  readonly kind: "flash"; readonly color: string; readonly intensity: number;
  readonly attackFrames: number; readonly holdFrames: number; readonly decayFrames: number;
};
export type ColorWashOverlay = { readonly kind: "color-wash"; readonly color: string; readonly opacity: number };
export type VignetteOverlay = {
  readonly kind: "vignette"; readonly center: { readonly x: number; readonly y: number };
  readonly radius: { readonly x: number; readonly y: number }; readonly softness: number;
  readonly color: string; readonly opacity: number;
};
export type ScanLinesOverlay = {
  readonly kind: "scan-lines"; readonly spacingPx: number; readonly thicknessPx: number;
  readonly angleDeg: number; readonly opacity: number; readonly travelPx: number;
};
export type DirectionalMatteOverlay = {
  readonly kind: "directional-matte"; readonly angleDeg: number; readonly coverage: number;
  readonly feather: number; readonly color: string; readonly opacity: number;
  readonly progress: { readonly from: number; readonly to: number };
};
export type WhipVeilOverlay = {
  readonly kind: "whip-veil"; readonly direction: "left" | "right" | "up" | "down";
  readonly widthPx: number; readonly softnessPx: number; readonly travelPx: number; readonly opacity: number;
};
export type GlitchVeilOverlay = {
  readonly kind: "glitch-veil"; readonly bars: number; readonly colors: readonly string[];
  readonly opacity: number; readonly travelPx: number; readonly seed: number;
};
export type GrainOverlay = {
  readonly kind: "grain"; readonly amount: number; readonly grainSizePx: number;
  readonly chroma: "monochrome" | "color"; readonly motionRatePxPerFrame: number; readonly seed: number;
};
export type LightLeakOverlay = {
  readonly kind: "light-leak"; readonly colors: readonly string[]; readonly angleDeg: number;
  readonly softness: number; readonly travelPx: number; readonly intensity: number; readonly seed: number;
};
export type BokehOverlay = {
  readonly kind: "bokeh"; readonly amount: number; readonly sizeMinPx: number; readonly sizeMaxPx: number;
  readonly color: string; readonly warmth: number; readonly driftPx: number; readonly seed: number;
};
export type TvStaticOverlay = {
  readonly kind: "tv-static"; readonly amount: number; readonly noiseSizePx: number;
  readonly scanLineOpacity: number; readonly motionRatePxPerFrame: number; readonly seed: number;
};

export type ScreenOverlayComponent =
  | FlashOverlay | ColorWashOverlay | VignetteOverlay | ScanLinesOverlay | DirectionalMatteOverlay
  | WhipVeilOverlay | GlitchVeilOverlay | GrainOverlay | LightLeakOverlay | BokehOverlay | TvStaticOverlay;

export type ScreenOverlayItemSpec = {
  readonly id: string;
  readonly content: ScreenOverlayComponent;
  readonly stackingOrder: number;
};
export type ScreenOverlayHeader = { readonly id: string };
export type ScreenOverlayItemProgram = {
  readonly id: string;
  /** Author-owned Item realized by this externally projected window. */
  readonly subjectId: string;
  readonly span: FrameSpan;
  readonly content: ScreenOverlayComponent;
  readonly stacking: { readonly order: number; readonly tieBreak: string };
};
export type ScreenOverlaySet = { readonly items: readonly ScreenOverlayItemProgram[] };
export type ScreenOverlayProgram = {
  readonly id: string;
  readonly items: readonly ScreenOverlayItemProgram[];
};
