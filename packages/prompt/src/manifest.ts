import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { textDependency, textTypes } from "@hypit/text";

export const promptModuleRef = { name: "@hypit/prompt", version: "1" } as const;

export const promptTypes = {
  prompt: { module: promptModuleRef, name: "Prompt" },
  template: { module: promptModuleRef, name: "PromptTemplate" },
  preset: { module: promptModuleRef, name: "PromptPreset" },
  bindings: { module: promptModuleRef, name: "PromptBindings" },
  slotBinding: { module: promptModuleRef, name: "PromptSlotBinding" },
} satisfies Record<string, TypeRef>;

export const promptProducers = {
  bindSlot: { module: promptModuleRef, name: "bind-slot" },
  render: { module: promptModuleRef, name: "render" },
} satisfies Record<string, ProducerRef>;

export const promptManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: promptModuleRef.name,
  version: promptModuleRef.version,
  dependencies: [textDependency],
  types: Object.values(promptTypes).map((type) => type.name),
  capabilities: [],
  producers: [{
    name: promptProducers.bindSlot.name,
    inputs: [
      { name: "bindings", type: promptTypes.bindings },
      { name: "binding", type: promptTypes.slotBinding },
      { name: "text", type: textTypes.text },
    ],
    result: { kind: "output", name: "bindings", type: promptTypes.bindings },
  }, {
    name: promptProducers.render.name,
    inputs: [
      { name: "template", type: promptTypes.template },
      { name: "bindings", type: promptTypes.bindings },
    ],
    result: { kind: "output", name: "prompt", type: promptTypes.prompt },
  }],
};

export const promptDependency = promptModuleRef;
