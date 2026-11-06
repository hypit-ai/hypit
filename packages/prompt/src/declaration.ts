import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationFieldValue,
  type AuthorResolvedReference,
} from "@hypit/author";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/protocol";
import { sealText, textTypes } from "@hypit/text";

import { createPromptRenderFragment } from "./fragment.js";
import { promptModuleRef, promptTypes } from "./manifest.js";
import {
  sealPrompt,
  sealPromptBindings,
  sealPromptPreset,
  sealPromptSlotBinding,
  sealPromptTemplate,
  validatePromptValues,
  verifyPromptPreset,
  verifyPromptTemplate,
} from "./program.js";
import type { PromptPreset, PromptTemplate, PromptTemplatePart } from "./types.js";

type Node = AuthorDeclaration | AuthorDeclarationChild;

function value(node: Node, name: string): AuthorDeclarationFieldValue | undefined {
  return declarationField(node, name);
}

function literal(node: Node, name: string): string {
  const item = value(node, name);
  if (item?.kind !== "literal" || item.value.trim().length === 0) {
    throw new Error(`Prompt ${node.name}.${name} must be a non-empty literal.`);
  }
  return item.value.trim();
}

function label(node: Node): string {
  if (node.label === undefined || node.label.trim().length === 0) throw new Error(`Prompt ${node.name} requires a label.`);
  return node.label;
}

function flag(node: Node, name: string): boolean {
  const item = literal(node, name);
  if (item === "true") return true;
  if (item === "false") return false;
  throw new Error(`Prompt ${node.name}.${name} must be true or false.`);
}

function recordValues(item: AuthorDeclarationFieldValue | undefined, subject: string): Record<string, string> {
  if (item === undefined) return {};
  if (item.kind !== "record") throw new Error(`${subject} must be a record.`);
  const result: Record<string, string> = {};
  for (const entry of item.entries) {
    if (entry.value.kind !== "literal" || entry.value.value.trim().length === 0) {
      throw new Error(`${subject}.${entry.name} must be one option name.`);
    }
    result[entry.name] = entry.value.value.trim();
  }
  return result;
}

function binding(name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "record", id: name }, type };
}

function output(name: string): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component: name, output: "prompt" }, type: promptTypes.prompt };
}

async function resolved(
  node: Node,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const item = value(node, name);
  if (item?.kind !== "reference") throw new Error(`Prompt ${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(item.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`Prompt ${node.name}.${name} has the wrong Type.`);
  return reference;
}

function authored<T>(reference: AuthorResolvedReference, subject: string): T {
  if (reference.record === undefined) throw new Error(`${subject} must reference an authored value.`);
  return reference.record.value as unknown as T;
}

function templateParts(declaration: AuthorDeclaration): PromptTemplatePart[] {
  return declaration.children.map((child): PromptTemplatePart => {
    const name = label(child);
    if (child.name === "fixed") return { kind: "fixed", name, text: literal(child, "text") };
    if (child.name === "slot") {
      const slotLabel = value(child, "label");
      return {
        kind: "slot",
        name,
        required: flag(child, "required"),
        ...(slotLabel === undefined ? {} : { label: literal(child, "label") }),
      };
    }
    if (child.name !== "choose") throw new Error(`Prompt Template does not accept ${child.name}.`);
    return {
      kind: "choice",
      name,
      default: literal(child, "default"),
      options: child.children.map((option) => ({ name: label(option), text: literal(option, "text") })),
    };
  });
}

const partShapes = [{
  name: "fixed", label: "required" as const, cardinality: "many" as const,
  summary: "Appends one fixed Prompt paragraph.",
  fields: [{ name: "text", kind: "literal" as const, required: true, summary: "Supplies the fixed paragraph." }],
}, {
  name: "choose", label: "required" as const, cardinality: "many" as const,
  summary: "Selects one paragraph from a finite author choice.",
  fields: [{ name: "default", kind: "literal" as const, required: true, summary: "Names the default option." }],
  children: [{
    name: "option", label: "required" as const, cardinality: "many" as const,
    summary: "Declares one allowed choice.",
    fields: [{ name: "text", kind: "literal" as const, required: true, summary: "Supplies the selected paragraph." }],
  }],
}, {
  name: "slot", label: "required" as const, cardinality: "many" as const,
  summary: "Inserts one exact Text input.",
  fields: [
    { name: "required", kind: "literal" as const, required: true, values: ["true", "false"], summary: "Requires a binding when true." },
    { name: "label", kind: "literal" as const, required: false, summary: "Prefixes the supplied Text." },
  ],
}] as const;

export const promptValueAuthorDeclaration: AuthorDeclarationCompiler = {
  module: promptModuleRef,
  declaration: "Prompt",
  outputs: [promptTypes.prompt],
  shape: {
    summary: "Authors one exact model Prompt.",
    label: "required",
    fields: [{ name: "text", kind: "literal", required: true, summary: "Supplies the Prompt text." }],
  },
  bindings(declaration) { return [binding(label(declaration), promptTypes.prompt)]; },
  compile({ declaration }) {
    const id = label(declaration);
    return { records: [{ id, type: promptTypes.prompt,
      value: sealPrompt(literal(declaration, "text")) as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const promptTemplateAuthorDeclaration: AuthorDeclarationCompiler = {
  module: promptModuleRef,
  declaration: "Template",
  outputs: [promptTypes.template],
  shape: {
    summary: "Authors one finite Prompt assembly.",
    label: "required",
    fields: [{ name: "separator", kind: "literal", required: false, values: ["paragraph"],
      summary: "Separates emitted parts as paragraphs." }],
    children: partShapes,
  },
  bindings(declaration) { return [binding(label(declaration), promptTypes.template)]; },
  compile({ declaration }) {
    const id = label(declaration);
    return { records: [{ id, type: promptTypes.template,
      value: sealPromptTemplate({ separator: "paragraph", parts: templateParts(declaration) }) as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const promptPresetAuthorDeclaration: AuthorDeclarationCompiler = {
  module: promptModuleRef,
  declaration: "Preset",
  outputs: [promptTypes.preset],
  shape: {
    summary: "Authors one reusable set of choices for a Prompt Template.",
    label: "required",
    fields: [
      { name: "template", kind: "reference", required: true, accepts: [promptTypes.template], summary: "Selects the Template whose choices are validated." },
      { name: "values", kind: "expression", required: true, summary: "Selects named Template options." },
    ],
  },
  bindings(declaration) { return [binding(label(declaration), promptTypes.preset)]; },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const template = authored<PromptTemplate>(await resolved(declaration, "template", promptTypes.template, resolveReference),
      `Prompt Preset ${id}.template`);
    verifyPromptTemplate(template);
    const values = recordValues(value(declaration, "values"), `Prompt Preset ${id}.values`);
    validatePromptValues(template, values, `Prompt Preset ${id}`);
    return { records: [{ id, type: promptTypes.preset,
      value: sealPromptPreset(values) as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const promptRenderAuthorDeclaration: AuthorDeclarationCompiler = {
  module: promptModuleRef,
  declaration: "Render",
  outputs: [promptTypes.prompt, promptTypes.bindings, promptTypes.slotBinding, textTypes.text],
  shape: {
    summary: "Renders one Prompt Template with one optional Preset, local choices and explicit Text slots.",
    label: "required",
    fields: [
      { name: "template", kind: "reference", required: true, accepts: [promptTypes.template], summary: "Selects the Prompt Template." },
      { name: "preset", kind: "reference", required: false, accepts: [promptTypes.preset], summary: "Selects one reusable choice set." },
      { name: "values", kind: "expression", required: false, summary: "Overrides named Template choices locally." },
    ],
    children: [{
      name: "bind", label: "required", cardinality: "many", summary: "Binds one Template slot from Text or a literal.",
      fields: [{ name: "value", kind: "expression", required: true, accepts: [textTypes.text], summary: "Supplies exact slot Text." }],
    }],
  },
  bindings(declaration) { return [output(label(declaration))]; },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const templateReference = await resolved(declaration, "template", promptTypes.template, resolveReference);
    const template = authored<PromptTemplate>(templateReference, `Prompt Render ${id}.template`);
    verifyPromptTemplate(template);
    const presetReference = value(declaration, "preset") === undefined
      ? undefined
      : await resolved(declaration, "preset", promptTypes.preset, resolveReference);
    const preset = presetReference === undefined ? undefined : authored<PromptPreset>(presetReference, `Prompt Render ${id}.preset`);
    if (preset !== undefined) verifyPromptPreset(preset);
    const choices = { ...(preset?.values ?? {}),
      ...recordValues(value(declaration, "values"), `Prompt Render ${id}.values`) };
    validatePromptValues(template, choices, `Prompt Render ${id}`);

    const records: Array<{ id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }> = [{
      id: `${id}.bindings`, type: promptTypes.bindings,
      value: sealPromptBindings(choices) as unknown as CanonicalValue, range: declaration.range,
    }];
    const inputs: Record<string, import("@hypit/author").AuthorValueRef> = {
      template: templateReference.ref,
      bindings: { kind: "record", id: `${id}.bindings` },
    };
    const slotNames = new Set<string>();
    for (const child of declaration.children) {
      const slot = label(child);
      if (slotNames.has(slot)) throw new Error(`Prompt Render ${id} repeats slot ${slot}.`);
      slotNames.add(slot);
      const slotValue = value(child, "value")!;
      let source: AuthorResolvedReference;
      if (slotValue.kind === "reference") {
        source = await resolved(child, "value", textTypes.text, resolveReference);
      } else if (slotValue.kind === "literal") {
        const textId = `${id}.slot.${slot}.text`;
        records.push({ id: textId, type: textTypes.text,
          value: sealText(slotValue.value) as unknown as CanonicalValue, range: declaration.range });
        source = { ref: { kind: "record", id: textId }, type: textTypes.text };
      } else {
        throw new Error(`Prompt Render ${id} slot ${slot} must be Text or a literal.`);
      }
      const bindingId = `${id}.slot.${slot}.binding`;
      records.push({ id: bindingId, type: promptTypes.slotBinding,
        value: sealPromptSlotBinding({ name: slot }) as unknown as CanonicalValue, range: declaration.range });
      inputs[`slot:${slot}:binding`] = { kind: "record", id: bindingId };
      inputs[`slot:${slot}:text`] = source.ref;
    }
    const slots = [...slotNames];
    return {
      records,
      components: [{ id, fragment: createPromptRenderFragment(slots), inputs,
        outputs: { prompt: id }, range: declaration.range }],
    };
  },
};

export const promptAuthorDeclarations = [
  promptValueAuthorDeclaration,
  promptTemplateAuthorDeclaration,
  promptPresetAuthorDeclaration,
  promptRenderAuthorDeclaration,
] as const;
