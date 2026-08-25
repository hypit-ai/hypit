import type { ComponentPackage } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { ProgramSpace } from "@hypit/program-space";
import type { CanvasSpace } from "@hypit/spatial";
import { screenOverlayProducers, screenOverlayTypes } from "./manifest.js";
import { appendProjectedScreenOverlay, assertScreenOverlayProgram, createScreenOverlaySet, finalizeScreenOverlay, renderScreenOverlay } from "./program.js";
import type { ScreenOverlayHeader, ScreenOverlayItemSpec, ScreenOverlayProgram, ScreenOverlaySet } from "./types.js";
import type { TemporalWindow } from "@hypit/temporal";
function inline<T>(value: StoredValue | undefined, label: string): T { if (value?.kind !== "inline") throw new Error(`${label} must be inline.`); return value.value as unknown as T; }
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });
export const screenOverlayComponent = {
  producers: [
    { producer: screenOverlayProducers.createSet, handler: () => ({ outputs: { set: output(createScreenOverlaySet()) }, needs: {} }) },
    { producer: screenOverlayProducers.appendItem, handler: ({ inputs }) => ({ outputs: { set: output(appendProjectedScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<ScreenOverlayItemSpec>(inputs.spec?.value, "ScreenOverlayItemSpec"), inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"))) }, needs: {} }) },
    { producer: screenOverlayProducers.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"))) }, needs: {} }) },
    { producer: screenOverlayProducers.render, handler: ({ inputs }) => ({ outputs: { track: output(renderScreenOverlay(inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<ScreenOverlayProgram>(inputs.program?.value, "ScreenOverlayProgram"))) }, needs: {} }) },
  ],
  validators: [{ type: screenOverlayTypes.program, handler: ({ value }) => assertScreenOverlayProgram(inline<ScreenOverlayProgram>(value, "ScreenOverlayProgram")) }],
} satisfies ComponentPackage;
