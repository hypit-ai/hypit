import type { StudioParameterDeclaration } from "@hypit/studio-adapter";

/**
 * A reference such as `frame={card-frame}` is not itself writable. Its
 * authored Frame is, so the Inspector expands these fields without inventing
 * a second geometry object in Studio.
 */
export const frameParameters: readonly StudioParameterDeclaration[] = [
  { name: "within", label: "Within", writable: false },
  { name: "left", label: "Left", writable: true },
  { name: "top", label: "Top", writable: true },
  { name: "right", label: "Right", writable: true },
  { name: "bottom", label: "Bottom", writable: true },
  { name: "x", label: "X", writable: true },
  { name: "y", label: "Y", writable: true },
  { name: "width", label: "Width", writable: true },
  { name: "height", label: "Height", writable: true },
];

export const extentParameters: readonly StudioParameterDeclaration[] = [
  { name: "width", label: "Width", control: "number", writable: true, unit: "px" },
  { name: "height", label: "Height", control: "number", writable: true, unit: "px" },
];
