import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation, GraphFragment } from "@hypit/hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";
import { temporalTypes } from "@hypit/temporal";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type CaptionOverrideFragmentSpec = {
  readonly key: string;
  readonly kind: "style" | "hidden";
};

/** Builds one Caption Source while preserving author-ordered presentation rules inside the component. */
export function createCaptionSourceFragment(
  overrides: readonly CaptionOverrideFragmentSpec[],
): GraphFragment {
  const inputs = [
    { name: "spec", type: captionTypes.componentSpec },
    { name: "document", type: captionTypes.document },
    { name: "timing", type: captionTypes.timing },
    { name: "style", type: captionTypes.style },
  ];
  const operations: FragmentOperation[] = [{
    id: "caption:presentation:base", producer: captionProducers.createPresentation,
    inputs: { style: input("style") }, result: { kind: "output", name: "presentation" },
  }];
  let presentationRoot = "caption:presentation:base";
  for (const override of overrides) {
    const specName = `${override.key}-spec`;
    inputs.push({ name: specName, type: captionTypes.presentationOverrideSpec });
    const styleName = `${override.key}-style`;
    if (override.kind === "style") inputs.push({ name: styleName, type: captionTypes.style });
    const id = `caption:presentation:${override.key}`;
    operations.push({
      id,
      producer: override.kind === "style"
        ? captionProducers.appendStyleOverride : captionProducers.appendHiddenOverride,
      inputs: {
        presentation: operation(presentationRoot),
        spec: input(specName),
        ...(override.kind === "style" ? { style: input(styleName) } : {}),
      },
      result: { kind: "output", name: "presentation" },
    });
    presentationRoot = id;
  }
  operations.push({
    id: "caption:schedule", producer: captionProducers.schedule,
    inputs: { spec: input("spec"), document: input("document"), timing: input("timing"),
      presentation: operation(presentationRoot) },
    result: { kind: "output", name: "schedule" },
  }, {
    id: "caption:source", producer: captionProducers.source,
    inputs: { spec: input("spec"), document: input("document"), timing: input("timing"),
      presentation: operation(presentationRoot) },
    result: { kind: "output", name: "source" },
  });
  return sealGraphFragment({ inputs, operations, exports: [
    { name: "source", type: audiovisualTypes.programSource, root: operation("caption:source") },
    { name: "presentation", type: captionTypes.presentation, root: operation(presentationRoot) },
    { name: "schedule", type: captionTypes.schedule, root: operation("caption:schedule") },
  ] });
}

export const captionSourceFragment = createCaptionSourceFragment([]);

export const captionUnitEventFragment = sealGraphFragment({
  inputs: [{ name: "timing", type: captionTypes.timing },
    { name: "spec", type: captionTypes.unitEventSpec }],
  operations: [{
    id: "caption:event", producer: captionProducers.unitEvent,
    inputs: { timing: input("timing"), spec: input("spec") },
    result: { kind: "output", name: "event" },
  }],
  exports: [{ name: "event", type: temporalTypes.regionSet, root: operation("caption:event") }],
});
