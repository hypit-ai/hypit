export * from "./types.js";
export * from "./picture.js";
export * from "./validation.js";
export * from "./selection.js";
export * from "./interpretation.js";

import { verifyMediaInspection, verifyMediaInterpretation } from "./validation.js";
import type { MediaInspection, MediaInterpretation } from "./types.js";

export function sealMediaInspection(value: MediaInspection): MediaInspection {
  verifyMediaInspection(value);
  return structuredClone(value);
}

export function sealMediaInterpretation(value: MediaInterpretation): MediaInterpretation {
  verifyMediaInterpretation(value);
  return structuredClone(value);
}
