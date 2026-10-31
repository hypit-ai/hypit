import { compositionDependency, compositionTypes, visualItemSchema } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const visualCombineModuleRef = { name: "@hypit/visual-combine", version: "1" } as const;
export const visualCombineTypes = {
  header: { module: visualCombineModuleRef, name: "VisualCombineHeader" },
  useSpec: { module: visualCombineModuleRef, name: "VisualCombineUseSpec" },
  block: { module: visualCombineModuleRef, name: "VisualCombineBlock" },
} satisfies Record<string, TypeRef>;
export const visualCombineProducers = {
  createBlock: { module: visualCombineModuleRef, name: "create-combine-block" },
  concatBlocks: { module: visualCombineModuleRef, name: "concat-combine-blocks" },
  finalizeBlock: { module: visualCombineModuleRef, name: "finalize-combine-block" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const visualCombineHeaderSchema = object({ id: { schema: string } });
export const visualCombineUseSpecSchema = object({ id: { schema: string } });
export const visualCombineBlockSchema = object({
  timelineId: { schema: string },
  useIds: { schema: { kind: "array", minItems: 1, items: string } },
  items: { schema: { kind: "array", items: visualItemSchema } },
});

export const visualCombineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualCombineModuleRef.name,
  version: visualCombineModuleRef.version,
  dependencies: [compositionDependency, timelineDependency],
  types: [visualCombineTypes.header.name, visualCombineTypes.useSpec.name, visualCombineTypes.block.name],
  capabilities: [],
  producers: [
    { name: visualCombineProducers.createBlock.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "spec", type: visualCombineTypes.useSpec },
      { name: "track", type: compositionTypes.visualTrack },
    ], result: { kind: "output", name: "block", type: visualCombineTypes.block } },
    { name: visualCombineProducers.concatBlocks.name, inputs: [
      { name: "left", type: visualCombineTypes.block },
      { name: "right", type: visualCombineTypes.block },
      { name: "timeline", type: timelineTypes.timeline },
    ], result: { kind: "output", name: "block", type: visualCombineTypes.block } },
    { name: visualCombineProducers.finalizeBlock.name, inputs: [
      { name: "block", type: visualCombineTypes.block },
      { name: "header", type: visualCombineTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
    ], result: { kind: "output", name: "track", type: compositionTypes.visualTrack } },
  ],
};
