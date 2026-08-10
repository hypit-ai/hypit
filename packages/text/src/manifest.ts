import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const textModuleRef = { name: "@narratage/text", version: "1" } as const;

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

export const textImplementationDigests = {
  svsFrontend: digestOf("@narratage/text/svs-frontend@1"),
  valueSurface: digestOf("@narratage/text/value-surface@1"),
  renderSurface: digestOf("@narratage/text/render-surface@1"),
  validateText: digestOf("@narratage/text/validate-text@1"),
  validateTemplate: digestOf("@narratage/text/validate-template@1"),
  validateBindings: digestOf("@narratage/text/validate-bindings@1"),
  validateBinding: digestOf("@narratage/text/validate-binding@1"),
  emptyBindings: digestOf("@narratage/text/empty-bindings@1"),
  bindText: digestOf("@narratage/text/bind-text@1"),
  render: digestOf("@narratage/text/render@1"),
} as const;

const openObject: ValueSchema = { kind: "object", fields: {}, allowUnknown: true };
const type = (name: string, schema: ValueSchema, locator: string, digest: (typeof textImplementationDigests)[keyof typeof textImplementationDigests]) => ({
  name,
  schema,
  validator: {
    abi: "svml.type-validator@1" as const,
    implementation: { kind: "registered" as const, locator, digest },
  },
});

export const textManifest: ModuleManifest = {
  format: "svml.module@1",
  name: textModuleRef.name,
  version: textModuleRef.version,
  dependencies: [],
  types: [
    type(textTypes.text.name, {
      kind: "object",
      fields: {
        contract: { schema: { kind: "literal", value: "svml.text@1" } },
        value: { schema: { kind: "string" } },
      },
    }, "@narratage/text/validate-text", textImplementationDigests.validateText),
    type(textTypes.template.name, openObject, "@narratage/text/validate-template", textImplementationDigests.validateTemplate),
    type(textTypes.bindings.name, openObject, "@narratage/text/validate-bindings", textImplementationDigests.validateBindings),
    type(textTypes.binding.name, {
      kind: "object",
      fields: {
        contract: { schema: { kind: "literal", value: "svml.text-binding@1" } },
        name: { schema: { kind: "string", minLength: 1 } },
        mode: { schema: { kind: "string", enum: ["set", "append"] } },
      },
    }, "@narratage/text/validate-binding", textImplementationDigests.validateBinding),
  ],
  capabilities: [],
  surfaces: [{
    name: "value",
    tag: "Value",
    mode: "structured",
    outputs: [textTypes.text],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/text/value-surface",
      digest: textImplementationDigests.valueSurface,
    },
  }, {
    name: "render",
    tag: "Render",
    mode: "structured",
    outputs: [textTypes.text, textTypes.bindings, textTypes.binding],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/text/render-surface",
      digest: textImplementationDigests.renderSurface,
    },
  }],
  producers: [
    {
      name: textProducers.emptyBindings.name,
      inputs: [],
      outputs: [{ name: "bindings", type: textTypes.bindings }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/text/empty-bindings", digest: textImplementationDigests.emptyBindings },
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
      implementation: { kind: "registered", locator: "@narratage/text/bind-text", digest: textImplementationDigests.bindText },
    },
    {
      name: textProducers.render.name,
      inputs: [
        { name: "template", type: textTypes.template },
        { name: "bindings", type: textTypes.bindings },
      ],
      outputs: [{ name: "text", type: textTypes.text }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/text/render", digest: textImplementationDigests.render },
    },
  ],
};

export const textManifestDigest = digestOf(textManifest);
export const textDependency = { module: textModuleRef, digest: textManifestDigest } as const;
