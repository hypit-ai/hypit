import { compositionDependency, compositionTypes, visualAdjustmentSchema, visualProgramCarrierSchema } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const visualAdjustmentModuleRef = { name: "@hypit/visual-adjustment", version: "1" } as const;
export const visualAdjustmentDependency = visualAdjustmentModuleRef;
export const visualAdjustmentTypes = {
  header: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentHeader" },
  effect: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentEffect" },
  spec: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentSpec" },
  set: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentSet" },
} satisfies Record<string, TypeRef>;
export const visualAdjustmentProducers = {
  createSet: { module: visualAdjustmentModuleRef, name: "create-adjustment-set" },
  append: { module: visualAdjustmentModuleRef, name: "append-adjustment" },
  finalize: { module: visualAdjustmentModuleRef, name: "finalize-adjustment-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const visualAdjustmentHeaderSchema = object({ id: { schema: string } });
export const visualAdjustmentSpecSchema = object({
  id: { schema: string },
  effect: { schema: visualProgramCarrierSchema },
});
export const visualAdjustmentSetSchema = object({ items: { schema: { kind: "array", items: visualAdjustmentSchema } } });

export const visualAdjustmentManifest: ModuleManifest = {
  format: "hypit.module@1", name: visualAdjustmentModuleRef.name, version: visualAdjustmentModuleRef.version,
  dependencies: [compositionDependency, temporalDependency, timelineDependency],
  types: [visualAdjustmentTypes.header.name, visualAdjustmentTypes.effect.name, visualAdjustmentTypes.spec.name, visualAdjustmentTypes.set.name],
  capabilities: [],
  producers: [
    { name: visualAdjustmentProducers.createSet.name, inputs: [], result: { kind: "output", name: "set", type: visualAdjustmentTypes.set } },
    { name: visualAdjustmentProducers.append.name, inputs: [
      { name: "set", type: visualAdjustmentTypes.set }, { name: "header", type: visualAdjustmentTypes.header },
      { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: visualAdjustmentTypes.spec },
      { name: "window", type: temporalTypes.window },
    ], result: { kind: "output", name: "set", type: visualAdjustmentTypes.set } },
    { name: visualAdjustmentProducers.finalize.name, inputs: [
      { name: "set", type: visualAdjustmentTypes.set }, { name: "header", type: visualAdjustmentTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
    ], result: { kind: "output", name: "track", type: compositionTypes.visualTrack } },
  ],
};
