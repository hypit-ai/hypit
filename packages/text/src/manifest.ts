import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { svsRecipeType } from "@hypit/svs";

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
    vocabulary: {
      summary: "Authors one literal Text value from the element's own body.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the Text Record this element publishes." },
      ],
      text: "The element's body is the exact Text value, with the blank lines around it and the indentation shared by every line removed.",
      example: `<text:Value id="extra">Keep the product readable.</text:Value>`,
      notes: [
        "The element accepts text only; a child element is refused.",
        "The Text is published under the bare `id`.",
      ],
    },
  }, {
    name: "render",
    tag: "Render",
    mode: "structured",
    outputs: [textTypes.text, textTypes.bindings, textTypes.binding],
    vocabulary: {
      summary: "Renders one TextTemplate against explicit bindings and publishes the result as an ordinary Text graph value.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the render, under which the rendered Text and its binding Records are published." },
        { name: "template", kind: "reference", required: true, accepts: [textTypes.template],
          summary: "Chooses the TextTemplate that is rendered.",
          recipe: [
            { name: "separator", required: false, values: ["paragraph"], fallback: "paragraph",
              summary: "Decides how the root Recipe joins its blocks, which is by one blank line." },
            { name: "default-<binding>", required: false,
              summary: "Fills the binding of that name from the root Recipe whenever a render supplies nothing for it." },
            { name: "kind", required: true, values: ["fixed", "axis", "variant", "slot"],
              summary: "Decides what a block Recipe contributes: literal Text, a choice keyed by one binding, a choice keyed by conditions, or a binding rendered in place." },
            { name: "order", required: true,
              summary: "Places a block among the Template's blocks as a non-negative integer no other block repeats." },
            { name: "text", required: true,
              summary: "Carries the literal Text a `fixed` block, or one choice of an `axis` or `variant` block, contributes." },
            { name: "parameter", required: true,
              summary: "Names the binding an `axis` block reads, whose value picks the choice carrying that id." },
            { name: "slot", required: true,
              summary: "Names the binding a `slot` block renders in place." },
            { name: "optional", required: false, fallback: "false",
              summary: "Decides whether a `slot` block is left out entirely when its binding is absent." },
            { name: "label", required: false,
              summary: "Puts one line of literal Text above the binding a `slot` block renders." },
            { name: "when-param-<binding>", required: false,
              summary: "Holds a `variant` choice back until the binding of that name equals this scalar." },
            { name: "when-select-<binding>", required: false,
              summary: "States the same condition as `when-param-`, for a binding an author reads as a Selection." },
          ] },
        { name: "recipe", kind: "reference", required: false, accepts: [svsRecipeType],
          summary: "Chooses the Recipe whose scalar properties fill the bindings the Template declares." },
      ],
      children: [
        { tag: "Param", cardinality: "many",
          summary: "Writes one scalar binding literally, in place of the Recipe property of that name.",
          attributes: [
            { name: "name", kind: "literal", required: true,
              summary: "Names the binding this scalar fills." },
            { name: "value", kind: "literal", required: true,
              summary: "Carries the scalar the binding takes, read as the declared type." },
            { name: "type", kind: "literal", required: false,
              values: ["text", "number", "boolean"],
              summary: "Chooses how `value` is read, defaulting to text." },
          ] },
        { tag: "Set", cardinality: "many",
          summary: "Connects one Text as a graph edge that replaces the binding of that name.",
          attributes: [
            { name: "name", kind: "literal", required: true,
              summary: "Names the binding this Text replaces." },
            { name: "text", kind: "reference", required: true,
              accepts: [textTypes.text],
              summary: "Selects the Text the binding takes." },
          ] },
        { tag: "Append", cardinality: "many",
          summary: "Connects one Text as a graph edge that is added after the binding of that name.",
          attributes: [
            { name: "name", kind: "literal", required: true,
              summary: "Names the binding this Text is added after." },
            { name: "text", kind: "reference", required: true,
              accepts: [textTypes.text],
              summary: "Selects the Text added after the binding." },
          ] },
      ],
      ports: [
        { name: "", type: textTypes.text,
          summary: "The rendered Text, addressed by the element's own id." },
      ],
      example: `<text:Render id="prompt" template={ugc.product-shot} recipe={studio.product-shot}>
  <text:Param name="camera" value="handheld"/>
  <text:Param name="strict" value="true" type="boolean"/>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Append name="constraints" text={extra}/>
</text:Render>`,
      notes: [
        "Two `Param` children may not carry the same name; `Set` and `Append` children apply in the order written.",
        "`recipe` fills only the bindings the Template declares; every other Recipe property is ignored, and a `Param` of the same name wins over it.",
        "A TextTemplate sheet declares exactly one root Recipe `text-template.<id>`, its blocks under `<root>.block.<block>` and their choices under `<root>.choice.<block>.<choice>`; any other Recipe beneath the root is refused.",
        "Each of those Recipes accepts exactly the properties its kind allows and refuses every other one; a `fixed` block takes `text`, an `axis` block takes `parameter`, a `variant` block takes neither, and a `slot` block takes `slot`, `optional` and `label`.",
        "The initial bindings are sealed into a TextBindings Record published as `<id>.bindings`, and each Set or Append spec into its own TextBinding Record.",
        "The element carries no text content of its own.",
      ],
    },
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
