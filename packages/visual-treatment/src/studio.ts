import type { StudioInspectorFieldDeclaration, StudioParameterCompanion } from "@hypit/studio-companion";
import { visualTreatmentModuleRef } from "./manifest.js";

function companion(
  declaration: string,
  bindings: StudioParameterCompanion["bindings"],
  inspector: readonly StudioInspectorFieldDeclaration[],
): StudioParameterCompanion {
  return { id: declaration, match: { module: visualTreatmentModuleRef, declaration }, bindings, inspector };
}

const numberField = (binding: string, label: string, domain: "where" | "how", page: string, section: string,
  options: { readonly minimum?: number; readonly maximum?: number; readonly step: number; readonly unit?: string }): StudioInspectorFieldDeclaration => ({
  binding, label, domain,
  page: { id: page.toLowerCase(), label: page }, section: { id: section.toLowerCase(), label: section },
  control: "number", number: {
    ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
    ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
    step: options.step,
  },
  ...(options.unit === undefined ? {} : { unit: options.unit }),
});

export const visualTreatmentStudioParameterCompanions: readonly StudioParameterCompanion[] = [
  companion("transform", [
    { name: "x", writable: true, fallback: 0 }, { name: "y", writable: true, fallback: 0 },
    { name: "scale", writable: true, fallback: 1 }, { name: "scale-x", writable: true }, { name: "scale-y", writable: true },
    { name: "rotate", writable: true, fallback: 0 }, { name: "origin-x", writable: true, fallback: 0.5 }, { name: "origin-y", writable: true, fallback: 0.5 },
  ], [
    numberField("x", "X", "where", "Transform", "Position", { step: 1, unit: "px" }),
    numberField("y", "Y", "where", "Transform", "Position", { step: 1, unit: "px" }),
    numberField("scale", "Scale", "where", "Transform", "Scale", { step: 0.01 }),
    numberField("rotate", "Rotation", "where", "Transform", "Rotation", { step: 1, unit: "°" }),
    numberField("origin-x", "Origin X", "where", "Transform", "Origin", { step: 0.01 }),
    numberField("origin-y", "Origin Y", "where", "Transform", "Origin", { step: 0.01 }),
  ]),
  companion("opacity", [{ name: "value", writable: true, fallback: 1 }], [
    numberField("value", "Opacity", "how", "Optics", "Opacity", { minimum: 0, maximum: 1, step: 0.01 }),
  ]),
  companion("blur", [{ name: "radius", writable: true, fallback: 0 }], [
    numberField("radius", "Radius", "how", "Optics", "Blur", { minimum: 0, step: 1, unit: "px" }),
  ]),
  companion("color", [
    { name: "brightness", writable: true, fallback: 1 }, { name: "contrast", writable: true, fallback: 1 },
    { name: "saturation", writable: true, fallback: 1 }, { name: "hue", writable: true, fallback: 0 },
    { name: "grayscale", writable: true, fallback: 0 }, { name: "sepia", writable: true, fallback: 0 },
    { name: "invert", writable: true, fallback: 0 },
  ], [
    numberField("brightness", "Brightness", "how", "Color", "Basic", { minimum: 0, step: 0.01 }),
    numberField("contrast", "Contrast", "how", "Color", "Basic", { minimum: 0, step: 0.01 }),
    numberField("saturation", "Saturation", "how", "Color", "Basic", { minimum: 0, step: 0.01 }),
    numberField("hue", "Hue", "how", "Color", "Basic", { step: 1, unit: "°" }),
    numberField("grayscale", "Grayscale", "how", "Color", "Stylize", { minimum: 0, maximum: 1, step: 0.01 }),
    numberField("sepia", "Sepia", "how", "Color", "Stylize", { minimum: 0, maximum: 1, step: 0.01 }),
    numberField("invert", "Invert", "how", "Color", "Stylize", { minimum: 0, maximum: 1, step: 0.01 }),
  ]),
];
