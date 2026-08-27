import { sealVisualTrack } from "@hypit/composition";
import type { ProgramSpace } from "@hypit/program-space";
import type { ComponentPackage, ProducerHandler } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import { VISUAL_IR_V1 } from "@hypit/visual-ir";
import { exampleProducers, exampleTypes } from "./manifest.js";

const inline = <T>(record: { readonly value: { readonly kind: string; readonly value?: unknown } } | undefined): T => {
  if (record?.value.kind !== "inline") throw new Error("example producer input must be inline");
  return record.value.value as T;
};
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });
function render(kind: string, space: ProgramSpace) {
  const frames = Math.max(1, Math.round(space.durationSec * space.frameRate.numerator / space.frameRate.denominator));
  return sealVisualTrack({
    programSpaceId: space.id,
    visualIr: VISUAL_IR_V1,
    id: `example-${kind}`,
    presents: [{ id: `present-${kind}`, span: { startFrame: 0, endFrameExclusive: frames }, stacking: { order: 0, tieBreak: kind }, elements: [{
      id: `${kind}-root`, kind: "box", order: 0,
      style: [{ name: "background-color", value: "#6b7280" }],
    }] }],
  });
}
const producer = (kind: string): { readonly handler: ProducerHandler } => ({ handler: ({ inputs }) => ({ outputs: { track: output(render(kind, inline<ProgramSpace>(inputs.space))) }, needs: {} }) });

export const exampleComponent = {
  producers: [
    { producer: exampleProducers.renderBox, ...producer("box") },
    { producer: exampleProducers.renderText, ...producer("text") },
    { producer: exampleProducers.renderMedia, ...producer("media") },
  ],
  validators: [
    { type: exampleTypes.box, handler: () => {} },
    { type: exampleTypes.text, handler: () => {} },
    { type: exampleTypes.mediaSlot, handler: () => {} },
  ],
} satisfies ComponentPackage;
