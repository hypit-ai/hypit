import { canonicalize } from "@narratage/protocol";

import type {
  Text,
  TextBinding,
  TextBindings,
  TextBindingValue,
  TextCondition,
  TextExpression,
  TextScalar,
  TextTemplate,
  TextTransform,
} from "./types.js";

const NAME = /^[a-z][a-z0-9-]{0,95}$/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function name(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && NAME.test(value), `${subject} must be a lower-kebab name`);
}

function scalar(value: unknown, subject: string): asserts value is TextScalar {
  assert(
    typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value)),
    `${subject} must be text, boolean or a finite number`,
  );
}

function bindingValue(value: unknown, subject: string): asserts value is TextBindingValue {
  if (!Array.isArray(value)) {
    scalar(value, subject);
    return;
  }
  value.forEach((item, index) => scalar(item, `${subject}[${index}]`));
}

function condition(value: unknown, subject: string): asserts value is TextCondition {
  const item = object(value, subject);
  if (item.kind === "present") {
    name(item.binding, `${subject}.binding`);
    return;
  }
  if (item.kind === "equals") {
    name(item.binding, `${subject}.binding`);
    scalar(item.value, `${subject}.value`);
    return;
  }
  if (item.kind === "all" || item.kind === "any") {
    assert(Array.isArray(item.conditions) && item.conditions.length > 0, `${subject}.conditions must be non-empty`);
    item.conditions.forEach((entry, index) => condition(entry, `${subject}.conditions[${index}]`));
    return;
  }
  if (item.kind === "not") {
    condition(item.condition, `${subject}.condition`);
    return;
  }
  throw new Error(`${subject}.kind is invalid`);
}

function transform(value: unknown, subject: string): asserts value is TextTransform {
  const item = object(value, subject);
  assert(
    item.kind === "trim"
      || item.kind === "trim-start"
      || item.kind === "trim-end"
      || item.kind === "uppercase"
      || item.kind === "lowercase"
      || item.kind === "collapse-whitespace"
      || item.kind === "normalize-newlines"
      || item.kind === "json-string",
    `${subject}.kind is invalid`,
  );
}

function expression(
  value: unknown,
  subject: string,
  calls: Set<string>,
): asserts value is TextExpression {
  const item = object(value, subject);
  if (item.kind === "literal") {
    assert(typeof item.value === "string", `${subject}.value must be text`);
    return;
  }
  if (item.kind === "slot") {
    name(item.binding, `${subject}.binding`);
    return;
  }
  if (item.kind === "sequence" || item.kind === "join") {
    assert(Array.isArray(item.items), `${subject}.items must be an array`);
    if (item.kind === "join") {
      assert(typeof item.separator === "string", `${subject}.separator must be text`);
      assert(item.omitEmpty === undefined || typeof item.omitEmpty === "boolean", `${subject}.omitEmpty must be boolean`);
    }
    item.items.forEach((entry, index) => expression(entry, `${subject}.items[${index}]`, calls));
    return;
  }
  if (item.kind === "choice") {
    assert(Array.isArray(item.cases) && item.cases.length > 0, `${subject}.cases must be non-empty`);
    item.cases.forEach((entry, index) => {
      const candidate = object(entry, `${subject}.cases[${index}]`);
      condition(candidate.when, `${subject}.cases[${index}].when`);
      expression(candidate.value, `${subject}.cases[${index}].value`, calls);
    });
    if (item.otherwise !== undefined) expression(item.otherwise, `${subject}.otherwise`, calls);
    return;
  }
  if (item.kind === "optional") {
    condition(item.when, `${subject}.when`);
    expression(item.value, `${subject}.value`, calls);
    return;
  }
  if (item.kind === "each") {
    name(item.binding, `${subject}.binding`);
    name(item.as, `${subject}.as`);
    assert(typeof item.separator === "string", `${subject}.separator must be text`);
    expression(item.value, `${subject}.value`, calls);
    return;
  }
  if (item.kind === "replace") {
    expression(item.input, `${subject}.input`, calls);
    assert(Array.isArray(item.replacements), `${subject}.replacements must be an array`);
    item.replacements.forEach((entry, index) => {
      const replacement = object(entry, `${subject}.replacements[${index}]`);
      assert(typeof replacement.from === "string" && replacement.from.length > 0,
        `${subject}.replacements[${index}].from must be non-empty text`);
      assert(typeof replacement.to === "string", `${subject}.replacements[${index}].to must be text`);
      assert(replacement.mode === "first" || replacement.mode === "all",
        `${subject}.replacements[${index}].mode is invalid`);
    });
    return;
  }
  if (item.kind === "transform") {
    expression(item.input, `${subject}.input`, calls);
    assert(Array.isArray(item.transforms) && item.transforms.length > 0, `${subject}.transforms must be non-empty`);
    item.transforms.forEach((entry, index) => transform(entry, `${subject}.transforms[${index}]`));
    return;
  }
  if (item.kind === "call") {
    name(item.template, `${subject}.template`);
    calls.add(item.template);
    return;
  }
  throw new Error(`${subject}.kind is invalid`);
}

function callGraph(template: TextTemplate): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const rootCalls = new Set<string>();
  expression(template.root, "TextTemplate.root", rootCalls);
  graph.set("$root", rootCalls);
  for (const [id, value] of Object.entries(template.definitions ?? {})) {
    name(id, `TextTemplate.definitions key ${id}`);
    const calls = new Set<string>();
    expression(value, `TextTemplate.definitions.${id}`, calls);
    graph.set(id, calls);
  }
  return graph;
}

function verifyFiniteCalls(template: TextTemplate): void {
  const graph = callGraph(template);
  for (const [from, calls] of graph) {
    for (const target of calls) {
      assert(graph.has(target), `TextTemplate ${from} calls unknown definition ${target}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `TextTemplate call cycle reaches ${id}`);
    visiting.add(id);
    for (const target of graph.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  visit("$root");
  for (const id of graph.keys()) visit(id);
}

export function verifyText(value: unknown): asserts value is Text {
  const item = object(value, "Text");
  assert(item.contract === "svml.text@1" && typeof item.value === "string", "Text is invalid");
}

export function sealText(value: string): Text {
  const result = canonicalize({ contract: "svml.text@1", value }) as unknown as Text;
  verifyText(result);
  return result;
}

export function verifyTextBindings(value: unknown): asserts value is TextBindings {
  const item = object(value, "TextBindings");
  assert(item.contract === "svml.text-bindings@1", "TextBindings contract is invalid");
  const values = object(item.values, "TextBindings.values");
  for (const [id, entry] of Object.entries(values)) {
    name(id, `TextBindings.values key ${id}`);
    bindingValue(entry, `TextBindings.values.${id}`);
  }
}

export function sealTextBindings(values: Readonly<Record<string, TextBindingValue>> = {}): TextBindings {
  const result = canonicalize({ contract: "svml.text-bindings@1", values }) as unknown as TextBindings;
  verifyTextBindings(result);
  return result;
}

export function verifyTextBinding(value: unknown): asserts value is TextBinding {
  const item = object(value, "TextBinding");
  assert(item.contract === "svml.text-binding@1", "TextBinding contract is invalid");
  name(item.name, "TextBinding.name");
  assert(item.mode === "set" || item.mode === "append", "TextBinding.mode is invalid");
}

export function sealTextBinding(value: Omit<TextBinding, "contract">): TextBinding {
  const result = canonicalize({ contract: "svml.text-binding@1", ...value }) as unknown as TextBinding;
  verifyTextBinding(result);
  return result;
}

export function bindText(
  bindings: TextBindings,
  binding: TextBinding,
  text: Text,
): TextBindings {
  verifyTextBindings(bindings);
  verifyTextBinding(binding);
  verifyText(text);
  const existing = bindings.values[binding.name];
  if (binding.mode === "set") {
    assert(existing === undefined, `Text binding ${binding.name} is already set`);
    return sealTextBindings({ ...bindings.values, [binding.name]: text.value });
  }
  if (existing === undefined) return sealTextBindings({ ...bindings.values, [binding.name]: [text.value] });
  const values = Array.isArray(existing) ? [...existing] : [existing];
  return sealTextBindings({ ...bindings.values, [binding.name]: [...values, text.value] });
}

export function verifyTextTemplate(value: unknown): asserts value is TextTemplate {
  const template = object(value, "TextTemplate") as unknown as TextTemplate;
  assert(template.contract === "svml.text-template@1", "TextTemplate contract is invalid");
  if (template.defaults !== undefined) {
    const defaults = object(template.defaults, "TextTemplate.defaults");
    for (const [id, entry] of Object.entries(defaults)) {
      name(id, `TextTemplate.defaults key ${id}`);
      bindingValue(entry, `TextTemplate.defaults.${id}`);
    }
  }
  if (template.definitions !== undefined) object(template.definitions, "TextTemplate.definitions");
  verifyFiniteCalls(template);
}

export function sealTextTemplate(value: TextTemplate): TextTemplate {
  const result = canonicalize(value) as unknown as TextTemplate;
  verifyTextTemplate(result);
  return result;
}

function collectBindings(
  value: TextExpression,
  template: TextTemplate,
  result: Set<string>,
  locals: ReadonlySet<string>,
): void {
  const add = (id: string) => { if (!locals.has(id)) result.add(id); };
  const collectCondition = (item: TextCondition): void => {
    if (item.kind === "present" || item.kind === "equals") {
      add(item.binding);
      return;
    }
    if (item.kind === "all" || item.kind === "any") {
      item.conditions.forEach(collectCondition);
      return;
    }
    collectCondition(item.condition);
  };
  if (value.kind === "literal") return;
  if (value.kind === "slot") {
    add(value.binding);
    return;
  }
  if (value.kind === "sequence" || value.kind === "join") {
    value.items.forEach((item) => collectBindings(item, template, result, locals));
    return;
  }
  if (value.kind === "choice") {
    value.cases.forEach((item) => {
      collectCondition(item.when);
      collectBindings(item.value, template, result, locals);
    });
    if (value.otherwise !== undefined) collectBindings(value.otherwise, template, result, locals);
    return;
  }
  if (value.kind === "optional") {
    collectCondition(value.when);
    collectBindings(value.value, template, result, locals);
    return;
  }
  if (value.kind === "each") {
    add(value.binding);
    collectBindings(value.value, template, result, new Set([...locals, value.as]));
    return;
  }
  if (value.kind === "replace" || value.kind === "transform") {
    collectBindings(value.input, template, result, locals);
    return;
  }
  const definition = template.definitions?.[value.template];
  if (definition !== undefined) collectBindings(definition, template, result, locals);
}

export function textTemplateBindingNames(template: TextTemplate): ReadonlySet<string> {
  verifyTextTemplate(template);
  const result = new Set<string>();
  collectBindings(template.root, template, result, new Set());
  return result;
}

function hasBinding(bindings: Readonly<Record<string, TextBindingValue>>, id: string): boolean {
  const value = bindings[id];
  return value !== undefined && (!Array.isArray(value) || value.length > 0);
}

function matches(value: TextCondition, bindings: Readonly<Record<string, TextBindingValue>>): boolean {
  if (value.kind === "present") return hasBinding(bindings, value.binding);
  if (value.kind === "equals") {
    const actual = bindings[value.binding];
    return !Array.isArray(actual) && actual === value.value;
  }
  if (value.kind === "all") return value.conditions.every((item) => matches(item, bindings));
  if (value.kind === "any") return value.conditions.some((item) => matches(item, bindings));
  return !matches(value.condition, bindings);
}

function scalarText(value: TextBindingValue | undefined, subject: string): string {
  assert(value !== undefined, `${subject} is missing`);
  assert(!Array.isArray(value), `${subject} is a list and must be consumed by each`);
  return String(value);
}

function applyTransform(value: string, operation: TextTransform): string {
  if (operation.kind === "trim") return value.trim();
  if (operation.kind === "trim-start") return value.trimStart();
  if (operation.kind === "trim-end") return value.trimEnd();
  if (operation.kind === "uppercase") return value.toUpperCase();
  if (operation.kind === "lowercase") return value.toLowerCase();
  if (operation.kind === "collapse-whitespace") return value.replace(/\s+/gu, " ").trim();
  if (operation.kind === "normalize-newlines") return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return JSON.stringify(value);
}

function renderExpression(
  value: TextExpression,
  template: TextTemplate,
  bindings: Readonly<Record<string, TextBindingValue>>,
): string {
  if (value.kind === "literal") return value.value;
  if (value.kind === "slot") return scalarText(bindings[value.binding], `Text binding ${value.binding}`);
  if (value.kind === "sequence") return value.items.map((item) => renderExpression(item, template, bindings)).join("");
  if (value.kind === "join") {
    const items = value.items.map((item) => renderExpression(item, template, bindings));
    return (value.omitEmpty === true ? items.filter((item) => item.length > 0) : items).join(value.separator);
  }
  if (value.kind === "choice") {
    const selected = value.cases.filter((item) => matches(item.when, bindings));
    assert(selected.length <= 1, `Text choice matched ${selected.length} cases`);
    if (selected.length === 1) return renderExpression(selected[0]!.value, template, bindings);
    assert(value.otherwise !== undefined, "Text choice matched no case and has no otherwise branch");
    return renderExpression(value.otherwise, template, bindings);
  }
  if (value.kind === "optional") {
    return matches(value.when, bindings) ? renderExpression(value.value, template, bindings) : "";
  }
  if (value.kind === "each") {
    const source = bindings[value.binding];
    assert(Array.isArray(source), `Text binding ${value.binding} must be a list`);
    return source.map((item) => renderExpression(value.value, template, { ...bindings, [value.as]: item })).join(value.separator);
  }
  if (value.kind === "replace") {
    let result = renderExpression(value.input, template, bindings);
    for (const replacement of value.replacements) {
      result = replacement.mode === "all"
        ? result.replaceAll(replacement.from, replacement.to)
        : result.replace(replacement.from, replacement.to);
    }
    return result;
  }
  if (value.kind === "transform") {
    return value.transforms.reduce(
      (result, operation) => applyTransform(result, operation),
      renderExpression(value.input, template, bindings),
    );
  }
  const definition = template.definitions?.[value.template];
  assert(definition !== undefined, `TextTemplate definition ${value.template} is missing`);
  return renderExpression(definition, template, bindings);
}

export function renderText(template: TextTemplate, bindings: TextBindings): Text {
  verifyTextTemplate(template);
  verifyTextBindings(bindings);
  const known = textTemplateBindingNames(template);
  for (const id of Object.keys(template.defaults ?? {})) {
    assert(known.has(id), `TextTemplate default ${id} is not consumed`);
  }
  for (const id of Object.keys(bindings.values)) {
    assert(known.has(id), `Text binding ${id} is not declared by the template`);
  }
  return sealText(renderExpression(template.root, template, { ...template.defaults, ...bindings.values }));
}
