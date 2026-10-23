import { sealPresentVisualTrack } from "@hypit/composition";
import type { Timeline } from "@hypit/timeline";
import type { SpatialFrame } from "@hypit/spatial";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, TypedRecord } from "@hypit/hypit/protocol";
import type { ProducerPackage, ProducerHandler } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { VISUAL_IR_V1 } from "@hypit/composition";
import { exampleProducers, exampleTypes } from "./manifest.js";

const valueOf = <T>(record: TypedRecord | undefined): T => {
  if (record?.value === undefined) throw new Error("example producer input is missing");
  return record.value as T;
};
const output = (value: unknown) => ((canonicalize(value)));
function image(record: TypedRecord | undefined): BlobRef | undefined {
  if (record === undefined) return undefined;
  assertBlobRef(record.value, "example ImageSlot input");
  if (!record.value.mediaType.startsWith("image/")) {
    throw new Error("example ImageSlot input must be an image Blob Artifact");
  }
  return record.value;
}
function render(kind: string, timeline: Timeline, within: SpatialFrame, image?: BlobRef) {
  const frames = timeline.frameCount;
  return sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: VISUAL_IR_V1,
    id: `example-${kind}`,
    presents: [{ id: `present-${kind}`, span: { startFrame: 0, endFrameExclusive: frames }, root: {
      id: `${kind}-root`, kind: "box",
      children: kind === "image" && image !== undefined ? [{ id: `${kind}-content`, kind: "image" as const, artifact: image, style: [{ name: "position", value: "absolute" }, { name: "left", value: 0 }, { name: "top", value: 0 }, { name: "width", value: "100%" }, { name: "height", value: "100%" }, { name: "object-fit", value: "contain" }] }] : [],
      style: [{ name: "position", value: "absolute" }, { name: "left", value: `${within.xPx}px` },
        { name: "top", value: `${within.yPx}px` }, { name: "width", value: `${within.widthPx}px` },
        { name: "height", value: `${within.heightPx}px` }, { name: "background-color", value: "#6b7280" }],
    } }],
  });
}
const producer = (kind: string): { readonly handler: ProducerHandler } => ({ handler: ({ inputs }) => ({ kind: "output", value: output(render(kind,
  valueOf<Timeline>(inputs.timeline), valueOf<SpatialFrame>(inputs.within), image(inputs.image))) }) });
const appendItems: { readonly handler: ProducerHandler } = { handler: ({ inputs }) => ({ kind: "output", value: output({ items: [valueOf<{ items: readonly unknown[] }>(inputs.previous).items, valueOf<{ items: readonly unknown[] }>(inputs.item).items].flat() }) }) };

export const exampleComponent = {
  producers: [
    { producer: exampleProducers.renderBox, ...producer("box") },
    { producer: exampleProducers.renderText, ...producer("text") },
    { producer: exampleProducers.renderImage, ...producer("image") },
    { producer: exampleProducers.appendItems, ...appendItems },
  ],
  refinements: [
    { type: exampleTypes.box, handler: () => {} },
    { type: exampleTypes.text, handler: () => {} },
    { type: exampleTypes.imageSlot, handler: () => {} },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
