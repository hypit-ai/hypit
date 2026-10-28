import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { recipeType } from "@hypit/recipe";

export const textModuleRef = { name: "@hypit/text", version: "1" } as const;

export const textTypes = {
  text: { module: textModuleRef, name: "Text" },
  template: { module: textModuleRef, name: "TextTemplate" },
  bindings: { module: textModuleRef, name: "TextBindings" },
  binding: { module: textModuleRef, name: "TextBinding" },
} satisfies Record<string, TypeRef>;

export const textProducers = {
  emptyBindings: { module: textModuleRef, name: "empty-bindings" },
  bindText: { module: textModuleRef, name: "bind-text" },
  render: { module: textModuleRef, name: "render" },
} satisfies Record<string, ProducerRef>;


export const textManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textModuleRef.name,
  version: textModuleRef.version,
  dependencies: [],
  types: [
    textTypes.text.name,
    textTypes.template.name,
    textTypes.bindings.name,
    textTypes.binding.name,
  ],
  capabilities: [],
  producers: [
    {
      name: textProducers.emptyBindings.name,
      inputs: [],
      result: { kind: "output" as const, name: "bindings", type: textTypes.bindings },
    },
    {
      name: textProducers.bindText.name,
      inputs: [
        { name: "bindings", type: textTypes.bindings },
        { name: "binding", type: textTypes.binding },
        { name: "text", type: textTypes.text },
      ],
      result: { kind: "output" as const, name: "bindings", type: textTypes.bindings },
    },
    {
      name: textProducers.render.name,
      inputs: [
        { name: "template", type: textTypes.template },
        { name: "bindings", type: textTypes.bindings },
      ],
      result: { kind: "output" as const, name: "text", type: textTypes.text },
    },
  ],
};

export const textDependency = textModuleRef;
