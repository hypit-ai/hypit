import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { StoredValue } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CanvasSpace } from "@narratage/spatial";
import { screenOverlayProducers, screenOverlayTypes } from "./manifest.js";
import { appendMomentScreenOverlay, appendProgramScreenOverlay, appendSelectionScreenOverlay, assertScreenOverlayProgram, createScreenOverlaySet, finalizeScreenOverlay, renderScreenOverlay } from "./program.js";
import type { ScreenOverlayHeader, ScreenOverlayItemSpec, ScreenOverlayProgram, ScreenOverlaySet } from "./types.js";
function inline<T>(value: StoredValue | undefined, label: string): T { if (value?.kind !== "inline") throw new Error(`${label} must be inline.`); return value.value as unknown as T; }
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });
export const screenOverlayComponent = {
  producers: [
    { producer: screenOverlayProducers.createSet, handler: () => ({ outputs: { set: output(createScreenOverlaySet()) }, needs: {} }) },
    { producer: screenOverlayProducers.appendProgram, handler: ({ inputs }) => ({ outputs: { set: output(appendProgramScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<ScreenOverlayItemSpec>(inputs.spec?.value, "ScreenOverlayItemSpec"))) }, needs: {} }) },
    { producer: screenOverlayProducers.appendSelection, handler: ({ inputs }) => ({ outputs: { set: output(appendSelectionScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"), inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"), inline<ScreenOverlayItemSpec>(inputs.spec?.value, "ScreenOverlayItemSpec"))) }, needs: {} }) },
    { producer: screenOverlayProducers.appendMoment, handler: ({ inputs }) => ({ outputs: { set: output(appendMomentScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"), inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"), inline<ScreenOverlayItemSpec>(inputs.spec?.value, "ScreenOverlayItemSpec"))) }, needs: {} }) },
    { producer: screenOverlayProducers.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeScreenOverlay(inline<ScreenOverlaySet>(inputs.set?.value, "ScreenOverlaySet"), inline<ScreenOverlayHeader>(inputs.header?.value, "ScreenOverlayHeader"))) }, needs: {} }) },
    { producer: screenOverlayProducers.render, handler: ({ inputs }) => ({ outputs: { track: output(renderScreenOverlay(inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<ScreenOverlayProgram>(inputs.program?.value, "ScreenOverlayProgram"))) }, needs: {} }) },
  ],
  validators: [{ type: screenOverlayTypes.program, handler: ({ value }) => assertScreenOverlayProgram(inline<ScreenOverlayProgram>(value, "ScreenOverlayProgram")) }],
} satisfies ComponentPackage;
