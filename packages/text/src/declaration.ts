import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/author";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/protocol";
import { recipeType, type Recipe } from "@hypit/recipe";

import { createTextRenderFragment } from "./fragment.js";
import { textModuleRef, textTypes } from "./manifest.js";
import {
  sealText,
  sealTextBinding,
  sealTextBindings,
  textTemplateBindingNames,
  verifyTextTemplate,
} from "./program.js";
import type { TextBindingValue, TextScalar, TextTemplate } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function bodyText(value: string | undefined): string {
  const lines = (value ?? "").replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n");
}

function idBinding(name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "record", id: name }, type };
}

function outputBinding(component: string, name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output: "text" }, type };
}

async function resolved(
  declaration: AuthorDeclaration,
  node: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) {
    throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  }
  return reference;
}

function authoredValue<T>(reference: AuthorResolvedReference, subject: string): T {
  if (reference.record === undefined) throw new Error(`${subject} must reference an authored value.`);
  return reference.record.value as unknown as T;
}

function parameterValue(child: AuthorDeclarationChild): TextScalar {
  const value = literal(child, "value");
  const type = field(child, "type");
  const kind = type?.kind === "literal" ? type.value : "text";
  if (kind === "text") return value;
  if (kind === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${child.name}.value must be true or false for type boolean.`);
  }
  if (kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${child.name}.value must be a finite number.`);
    return parsed;
  }
  throw new Error(`${child.name}.type must be text, number or boolean.`);
}

export const textValueAuthorDeclaration: AuthorDeclarationCompiler = {
  module: textModuleRef,
  declaration: "value",
  outputs: [textTypes.text],
  shape: {
    summary: "Authors one literal Text value.",
    fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the Text." }],
    text: "Supplies the literal Text body.",
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [idBinding(id, textTypes.text)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    return {
      records: [{
        id,
        type: textTypes.text,
        value: sealText(bodyText(declaration.text)) as unknown as CanonicalValue,
        range: declaration.range,
      }],
      components: [],
    };
  },
};

export const textRenderAuthorDeclaration: AuthorDeclarationCompiler = {
  module: textModuleRef,
  declaration: "render",
  outputs: [textTypes.text, textTypes.bindings, textTypes.binding],
  shape: {
    summary: "Renders one TextTemplate against explicit scalar and Text bindings.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the rendered Text." },
      { name: "template", kind: "reference", required: true, accepts: [textTypes.template], summary: "Selects the TextTemplate." },
      { name: "recipe", kind: "reference", required: false, accepts: [recipeType], summary: "Optionally supplies scalar Recipe bindings." },
    ],
    children: [{
      name: "Param", cardinality: "many", summary: "Authors one scalar binding.", fields: [
        { name: "name", kind: "literal", required: true, summary: "Names the binding." },
        { name: "value", kind: "literal", required: true, summary: "Supplies its scalar value." },
        { name: "type", kind: "literal", required: false, values: ["text", "number", "boolean"], summary: "Selects scalar decoding." },
      ],
    }, {
      name: "Set", cardinality: "many", summary: "Sets one binding from a Text edge.", fields: [
        { name: "name", kind: "literal", required: true, summary: "Names the binding." },
        { name: "text", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text." },
      ],
    }, {
      name: "Append", cardinality: "many", summary: "Appends one Text edge to a binding.", fields: [
        { name: "name", kind: "literal", required: true, summary: "Names the binding." },
        { name: "text", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text." },
      ],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, id, textTypes.text)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const template = await resolved(declaration, declaration, "template", textTypes.template, resolveReference);
    const initial: Record<string, TextBindingValue> = {};
    if (field(declaration, "recipe") !== undefined) {
      const templateValue = authoredValue<TextTemplate>(template, `${declaration.name}.template`);
      verifyTextTemplate(templateValue);
      const consumed = textTemplateBindingNames(templateValue);
      const recipe = await resolved(declaration, declaration, "recipe", recipeType, resolveReference);
      const value = authoredValue<Recipe>(recipe, `${declaration.name}.recipe`);
      for (const [name, item] of Object.entries(value.properties)) {
        if (!consumed.has(name)) continue;
        if (typeof item !== "string" && typeof item !== "boolean" && !(typeof item === "number" && Number.isFinite(item))) {
          throw new Error(`${value.path}.${name} must be text, boolean or a finite number.`);
        }
        initial[name] = item;
      }
    }
    const explicitParams = new Set<string>();
    const dynamic: Array<{
      readonly input: string;
      readonly name: string;
      readonly mode: "set" | "append";
      readonly source: AuthorResolvedReference;
      readonly range: AuthorDeclarationChild["range"];
    }> = [];
    for (const child of declaration.children) {
      if (child.name === "Param") {
        const name = literal(child, "name");
        if (explicitParams.has(name)) throw new Error(`${declaration.name} repeats Param ${name}.`);
        explicitParams.add(name);
        initial[name] = parameterValue(child);
        continue;
      }
      const input = `binding-${String(dynamic.length + 1).padStart(4, "0")}`;
      dynamic.push({
        input,
        name: literal(child, "name"),
        mode: child.name === "Set" ? "set" : "append",
        source: await resolved(declaration, child, "text", textTypes.text, resolveReference),
        range: child.range,
      });
    }
    const bindingsId = `${id}.bindings`;
    const fragment = createTextRenderFragment(dynamic.map((item) => ({ name: item.input })));
    return {
      records: [{
        id: bindingsId,
        type: textTypes.bindings,
        value: sealTextBindings(initial) as unknown as CanonicalValue,
        range: declaration.range,
      }, ...dynamic.map((item) => ({
        id: `${id}.${item.input}`,
        type: textTypes.binding,
        value: sealTextBinding({ name: item.name, mode: item.mode }) as unknown as CanonicalValue,
        range: item.range ?? declaration.range,
      }))],
      components: [{
        id,
        fragment,
        inputs: {
          template: template.ref,
          bindings: { kind: "record", id: bindingsId },
          ...Object.fromEntries(dynamic.flatMap((item) => [[
            `binding:${item.input}:spec`, { kind: "record" as const, id: `${id}.${item.input}` },
          ], [
            `binding:${item.input}:text`, item.source.ref,
          ]])),
        },
        outputs: { text: id },
        range: declaration.range,
      }],
    };
  },
};

export const textAuthorDeclarations = [textValueAuthorDeclaration, textRenderAuthorDeclaration] as const;

export const textMarkupDeclarations = [{ name: "value", tag: "Value" }, {
  name: "render", tag: "Render",
}] as const;
