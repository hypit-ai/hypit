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
  renderSurface: digestOf("@narratage/text/render-surface-with-recipe@1"),
  validateText: digestOf("@narratage/text/validate-text@1"),
  validateTemplate: digestOf("@narratage/text/validate-template@1"),
  validateBindings: digestOf("@narratage/text/validate-bindings@1"),
  validateBinding: digestOf("@narratage/text/validate-binding@1"),
  emptyBindings: digestOf("@narratage/text/empty-bindings@1"),
  bindText: digestOf("@narratage/text/bind-text@1"),
  render: digestOf("@narratage/text/render@1"),
} as const;

const openObject: ValueSchema = { kind: "object", fields: {}, allowUnknown: true };
const type = (
  name: string,
  schema: ValueSchema,
  digest: (typeof textImplementationDigests)[keyof typeof textImplementationDigests],
) => ({
  name,
  schema,
  validator: {
    implementation: { digest },
  },
});

export const textMarkupSurfaces = [{
    name: "value",
    tag: "Value",
    mode: "structured",
    outputs: [textTypes.text],
    implementation: {
      digest: textImplementationDigests.valueSurface,
    },
  }, {
    name: "render",
    tag: "Render",
    mode: "structured",
    outputs: [textTypes.text, textTypes.bindings, textTypes.binding],
    implementation: {
      digest: textImplementationDigests.renderSurface,
    },
  }] as const;


export const textManifest: ModuleManifest = {
  format: "svml.module@1",
  name: textModuleRef.name,
  version: textModuleRef.version,
  dependencies: [],
  types: [
    type(textTypes.text.name, {
      kind: "object",
      fields: {

        value: { schema: { kind: "string" } },
      },
    }, textImplementationDigests.validateText),
    type(textTypes.template.name, openObject, textImplementationDigests.validateTemplate),
    type(textTypes.bindings.name, openObject, textImplementationDigests.validateBindings),
    type(textTypes.binding.name, {
      kind: "object",
      fields: {

        name: { schema: { kind: "string", minLength: 1 } },
        mode: { schema: { kind: "string", enum: ["set", "append"] } },
      },
    }, textImplementationDigests.validateBinding),
  ],
  capabilities: [],
  producers: [
    {
      name: textProducers.emptyBindings.name,
      inputs: [],
      outputs: [{ name: "bindings", type: textTypes.bindings }],
      needs: [],
      implementation: { digest: textImplementationDigests.emptyBindings },
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
      implementation: { digest: textImplementationDigests.bindText },
    },
    {
      name: textProducers.render.name,
      inputs: [
        { name: "template", type: textTypes.template },
        { name: "bindings", type: textTypes.bindings },
      ],
      outputs: [{ name: "text", type: textTypes.text }],
      needs: [],
      implementation: { digest: textImplementationDigests.render },
    },
  ],
};

export const textManifestDigest = digestOf(textManifest);
export const textDependency = { module: textModuleRef, digest: textManifestDigest } as const;
