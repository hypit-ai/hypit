import type { StudioInspectorFieldDeclaration, StudioParameterCompanion } from "@hypit/studio-companion";
import { visualTransitionModuleRef } from "./manifest.js";

const easing = {
  binding: "easing", label: "Easing", domain: "how",
  page: { id: "motion", label: "Motion" }, section: { id: "progress", label: "Progress" },
  control: "select", options: ["linear", "ease-in", "ease-out", "ease-in-out"],
} as const satisfies StudioInspectorFieldDeclaration;

const direction = {
  binding: "direction", label: "Direction", domain: "where",
  page: { id: "motion", label: "Motion" }, section: { id: "direction", label: "Direction" },
  control: "select", options: ["left", "right", "up", "down"],
} as const satisfies StudioInspectorFieldDeclaration;

function companion(
  declaration: string,
  bindings: StudioParameterCompanion["bindings"],
  inspector: readonly StudioInspectorFieldDeclaration[],
): StudioParameterCompanion {
  return { id: declaration, match: { module: visualTransitionModuleRef, declaration }, bindings, inspector };
}

export const visualTransitionStudioParameterCompanions: readonly StudioParameterCompanion[] = [
  companion("cross-dissolve", [{ name: "easing", writable: true, fallback: "linear" }], [easing]),
  companion("dip-to-color", [
    { name: "color", writable: true, fallback: "#000000" },
    { name: "easing", writable: true, fallback: "linear" },
  ], [{
    binding: "color", label: "Color", domain: "how",
    page: { id: "blend", label: "Blend" }, section: { id: "color", label: "Color" },
    control: "color", swatches: ["#000000", "#ffffff"],
  }, easing]),
  companion("push", [
    { name: "direction", writable: true, fallback: "left" },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [direction, easing]),
  companion("slide", [
    { name: "direction", writable: true, fallback: "left" },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [direction, easing]),
  companion("linear-wipe", [
    { name: "direction", writable: true, fallback: "right" },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [direction, easing]),
  companion("iris", [
    { name: "shape", writable: true, fallback: "circle" },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [{
    binding: "shape", label: "Shape", domain: "how",
    page: { id: "aperture", label: "Aperture" }, section: { id: "shape", label: "Shape" },
    control: "select", options: ["circle", "box", "diamond"],
  }, easing]),
  companion("zoom-dissolve", [
    { name: "strength", writable: true, fallback: 0.16 },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [{
    binding: "strength", label: "Strength", domain: "how",
    page: { id: "motion", label: "Motion" }, section: { id: "scale", label: "Scale" },
    control: "number", number: { minimum: 0, maximum: 1, step: 0.01 },
  }, easing]),
  companion("blur-dissolve", [
    { name: "radius", writable: true, fallback: 20 },
    { name: "easing", writable: true, fallback: "ease-in-out" },
  ], [{
    binding: "radius", label: "Radius", domain: "how",
    page: { id: "optics", label: "Optics" }, section: { id: "blur", label: "Blur" },
    control: "number", unit: "px", number: { minimum: 0, maximum: 200, step: 1 },
  }, easing]),
];
