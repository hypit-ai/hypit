import type { ValueSchema } from "@hypit/hypit/protocol";

export type VisualAdjustmentProperty = {
  readonly name: string;
  readonly summary: string;
  readonly fallback: number;
  readonly schema: Extract<ValueSchema, { readonly kind: "number" }>;
  readonly domain: "where" | "how";
  readonly section: "transform" | "color" | "optics";
  readonly unit?: string;
};

const number = (minimum?: number, maximum?: number): VisualAdjustmentProperty["schema"] => ({
  kind: "number",
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});

/** One author vocabulary shared by parsing, public docs and Studio. */
export const visualAdjustmentProperties: readonly VisualAdjustmentProperty[] = [
  { name: "blur", summary: "Gaussian blur radius in pixels; 0 is identity.", fallback: 0, schema: number(0), domain: "how", section: "optics", unit: "px" },
  { name: "brightness", summary: "Brightness multiplier; 1 is identity.", fallback: 1, schema: number(0), domain: "how", section: "color" },
  { name: "contrast", summary: "Contrast multiplier; 1 is identity.", fallback: 1, schema: number(0), domain: "how", section: "color" },
  { name: "saturation", summary: "Saturation multiplier; 1 is identity.", fallback: 1, schema: number(0), domain: "how", section: "color" },
  { name: "hue", summary: "Hue rotation in degrees; 0 is identity.", fallback: 0, schema: number(), domain: "how", section: "color", unit: "°" },
  { name: "grayscale", summary: "Grayscale amount from 0 to 1.", fallback: 0, schema: number(0, 1), domain: "how", section: "color" },
  { name: "sepia", summary: "Sepia amount from 0 to 1.", fallback: 0, schema: number(0, 1), domain: "how", section: "color" },
  { name: "invert", summary: "Inversion amount from 0 to 1.", fallback: 0, schema: number(0, 1), domain: "how", section: "color" },
  { name: "opacity", summary: "Opacity of the accumulated picture from 0 to 1.", fallback: 1, schema: number(0, 1), domain: "how", section: "optics" },
  { name: "translate-x", summary: "Horizontal picture translation in pixels.", fallback: 0, schema: number(), domain: "where", section: "transform", unit: "px" },
  { name: "translate-y", summary: "Vertical picture translation in pixels.", fallback: 0, schema: number(), domain: "where", section: "transform", unit: "px" },
  { name: "scale-x", summary: "Horizontal picture scale; must be positive.", fallback: 1, schema: number(), domain: "where", section: "transform" },
  { name: "scale-y", summary: "Vertical picture scale; must be positive.", fallback: 1, schema: number(), domain: "where", section: "transform" },
  { name: "rotation", summary: "Picture rotation in degrees.", fallback: 0, schema: number(), domain: "where", section: "transform", unit: "°" },
  { name: "origin-x", summary: "Horizontal transform origin from 0 to 1.", fallback: 0.5, schema: number(0, 1), domain: "where", section: "transform" },
  { name: "origin-y", summary: "Vertical transform origin from 0 to 1.", fallback: 0.5, schema: number(0, 1), domain: "where", section: "transform" },
] as const;
