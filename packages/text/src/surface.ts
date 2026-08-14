import type { CanonicalValue } from "@narratage/protocol";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@narratage/markup";

import { createTextRenderFragment } from "./fragment.js";
import {
  sealText,
  sealTextBinding,
  sealTextBindings,
  textTemplateBindingNames,
  verifyTextTemplate,
} from "./program.js";
import { textTypes } from "./manifest.js";
import type { TextBindingValue, TextScalar, TextTemplate } from "./types.js";

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[] = []): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}`);
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be non-empty text`);
  }
  return value.trim();
}

function referencePath(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referencePath(element, name);
  const result = resolve(path);
  if (result === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  if (!sameType(result.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return result;
}

function inline<T>(value: SurfaceResolvedReference, subject: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline value`);
  return value.record.value.value as unknown as T;
}

function bodyText(element: StructuredElement): string {
  if (element.children.some((child) => child.kind === "element")) {
    throw new Error(`${element.name} accepts text only`);
  }
  const raw = element.children.map((child) => child.kind === "text" ? child.value : "").join("");
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n");
}

function parameterValue(element: StructuredElement): TextScalar {
  const value = stringAttribute(element, "value");
  const kind = element.attributes.type ?? "text";
  if (kind === "text") return value;
  if (kind === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${element.name}.value must be true or false for type boolean`);
  }
  if (kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${element.name}.value must be a finite number`);
    return parsed;
  }
  throw new Error(`${element.name}.type must be text, number or boolean`);
}

/** Author one literal graph Text value. */
export const decodeTextValueSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id"], ["id"]);
  const id = stringAttribute(element, "id");
  return {
    records: [{
      id,
      type: textTypes.text,
      value: { kind: "inline", value: sealText(bodyText(element)) as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};

/**
 * Render one TextTemplate. Param children author scalar bindings; Set/Append
 * children attach ordinary Text graph edges in source order.
 */
export const decodeTextRenderSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "template", "recipe"], ["id", "template"]);
  const id = stringAttribute(element, "id");
  const template = reference(element, "template", textTypes.template, resolveReference);
  const initial: Record<string, TextBindingValue> = {};
  if (element.attributes.recipe !== undefined) {
    const templateValue = inline<TextTemplate>(template, `${element.name}.template`);
    verifyTextTemplate(templateValue);
    const consumed = textTemplateBindingNames(templateValue);
    const recipe = reference(element, "recipe", svsRecipeType, resolveReference);
    const value = inline<SvsRecipe>(recipe, `${element.name}.recipe`);
    for (const [name, item] of Object.entries(value.properties)) {
      if (!consumed.has(name)) continue;
      if (typeof item !== "string" && typeof item !== "boolean" && !(typeof item === "number" && Number.isFinite(item))) {
        throw new Error(`${value.path}.${name} must be text, boolean or a finite number`);
      }
      initial[name] = item;
    }
  }
  const explicitParams = new Set<string>();
  const dynamic: Array<{
    readonly input: string;
    readonly name: string;
    readonly mode: "set" | "append";
    readonly source: SurfaceResolvedReference;
  }> = [];

  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Param, Set or Append children`);
      continue;
    }
    const kind = localName(child.name);
    if (kind === "Param") {
      exact(child, ["name", "value", "type"], ["name", "value"]);
      const name = stringAttribute(child, "name");
      if (explicitParams.has(name)) throw new Error(`${element.name} repeats Param ${name}`);
      explicitParams.add(name);
      initial[name] = parameterValue(child);
      continue;
    }
    if (kind !== "Set" && kind !== "Append") {
      throw new Error(`${element.name} accepts only Param, Set or Append children`);
    }
    exact(child, ["name", "text"], ["name", "text"]);
    const input = `binding-${String(dynamic.length + 1).padStart(4, "0")}`;
    dynamic.push({
      input,
      name: stringAttribute(child, "name"),
      mode: kind === "Set" ? "set" : "append",
      source: reference(child, "text", textTypes.text, resolveReference),
    });
  }

  const bindingsId = `${id}.bindings`;
  const fragment = createTextRenderFragment(dynamic.map((item) => ({ name: item.input })));
  const records = [{
    id: bindingsId,
    type: textTypes.bindings,
    value: { kind: "inline" as const, value: sealTextBindings(initial) as unknown as CanonicalValue },
    range: element.range,
  }, ...dynamic.map((item) => ({
    id: `${id}.${item.input}`,
    type: textTypes.binding,
    value: {
      kind: "inline" as const,
      value: sealTextBinding({ name: item.name, mode: item.mode }) as unknown as CanonicalValue,
    },
    range: element.range,
  }))];
  return {
    records,
    components: [{
      id,
      fragment: fragment.id,
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
      range: element.range,
    }],
    fragments: [fragment],
  };
};
