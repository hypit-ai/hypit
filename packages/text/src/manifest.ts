import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";

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

export const textMarkupSurfaces = [{
    name: "value",
    tag: "Value",
    mode: "structured",
    outputs: [textTypes.text],
  }, {
    name: "render",
    tag: "Render",
    mode: "structured",
    outputs: [textTypes.text, textTypes.bindings, textTypes.binding],
  }] as const;


export const textManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textModuleRef.name,
  version: textModuleRef.version,
  dependencies: [],
  types: [
    { name: textTypes.text.name },
    { name: textTypes.template.name },
    { name: textTypes.bindings.name },
    { name: textTypes.binding.name },
  ],
  capabilities: [],
  producers: [
    {
      name: textProducers.emptyBindings.name,
      inputs: [],
      outputs: [{ name: "bindings", type: textTypes.bindings }],
      needs: [],
    },
    {
      name: textProducers.bindText.name,
      inputs: [
        { name: "bindings", type: textTypes.bindings },
        { name: "binding", type: textTypes.binding },
        { name: "text", type: textTypes.text },
      ],
      outputs: [{ name: "bindings", type: textTypes.bindings }],
      needs: [],
    },
    {
      name: textProducers.render.name,
      inputs: [
        { name: "template", type: textTypes.template },
        { name: "bindings", type: textTypes.bindings },
      ],
      outputs: [{ name: "text", type: textTypes.text }],
      needs: [],
    },
  ],
};

export const textDependency = { module: textModuleRef } as const;
