import { canonicalize } from "@hypit/hypit/value";
import { verifyText } from "@hypit/hypit/text";
import type { Text } from "@hypit/text";

import type {
  Prompt,
  PromptBindings,
  PromptPreset,
  PromptSlotBinding,
  PromptTemplate,
  PromptTemplatePart,
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

function nonEmpty(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be non-empty text`);
}

export function verifyPrompt(value: unknown): asserts value is Prompt {
  const item = object(value, "Prompt");
  nonEmpty(item.value, "Prompt.value");
}

export function sealPrompt(value: string): Prompt {
  const result = canonicalize({ value }) as unknown as Prompt;
  verifyPrompt(result);
  return result;
}

function verifyPart(value: unknown, subject: string): asserts value is PromptTemplatePart {
  const part = object(value, subject);
  name(part.name, `${subject}.name`);
  if (part.kind === "fixed") {
    nonEmpty(part.text, `${subject}.text`);
    return;
  }
  if (part.kind === "choice") {
    name(part.default, `${subject}.default`);
    assert(Array.isArray(part.options) && part.options.length > 0, `${subject}.options must be non-empty`);
    const names = new Set<string>();
    part.options.forEach((raw, index) => {
      const option = object(raw, `${subject}.options[${index}]`);
      name(option.name, `${subject}.options[${index}].name`);
      assert(!names.has(option.name), `${subject} repeats option ${option.name}`);
      names.add(option.name);
      nonEmpty(option.text, `${subject}.options[${index}].text`);
    });
    assert(names.has(part.default), `${subject}.default must name one option`);
    return;
  }
  assert(part.kind === "slot", `${subject}.kind is invalid`);
  assert(typeof part.required === "boolean", `${subject}.required must be boolean`);
  if (part.label !== undefined) nonEmpty(part.label, `${subject}.label`);
}

export function verifyPromptTemplate(value: unknown): asserts value is PromptTemplate {
  const template = object(value, "PromptTemplate");
  assert(template.separator === "paragraph", "PromptTemplate.separator must be paragraph");
  assert(Array.isArray(template.parts) && template.parts.length > 0, "PromptTemplate.parts must be non-empty");
  const names = new Set<string>();
  template.parts.forEach((part, index) => {
    verifyPart(part, `PromptTemplate.parts[${index}]`);
    assert(!names.has(part.name), `PromptTemplate repeats part ${part.name}`);
    names.add(part.name);
  });
}

export function sealPromptTemplate(value: PromptTemplate): PromptTemplate {
  const result = canonicalize(value) as unknown as PromptTemplate;
  verifyPromptTemplate(result);
  return result;
}

export function verifyPromptPreset(value: unknown): asserts value is PromptPreset {
  const preset = object(value, "PromptPreset");
  const values = object(preset.values, "PromptPreset.values");
  for (const [key, item] of Object.entries(values)) {
    name(key, `PromptPreset.values key ${key}`);
    name(item, `PromptPreset.values.${key}`);
  }
}

export function sealPromptPreset(values: Readonly<Record<string, string>>): PromptPreset {
  const result = canonicalize({ values }) as unknown as PromptPreset;
  verifyPromptPreset(result);
  return result;
}

export function verifyPromptBindings(value: unknown): asserts value is PromptBindings {
  const bindings = object(value, "PromptBindings");
  const values = object(bindings.values, "PromptBindings.values");
  const slots = object(bindings.slots, "PromptBindings.slots");
  for (const [key, item] of Object.entries(values)) {
    name(key, `PromptBindings.values key ${key}`);
    name(item, `PromptBindings.values.${key}`);
  }
  for (const [key, item] of Object.entries(slots)) {
    name(key, `PromptBindings.slots key ${key}`);
    assert(typeof item === "string", `PromptBindings.slots.${key} must be text`);
  }
}

export function sealPromptBindings(
  values: Readonly<Record<string, string>> = {},
  slots: Readonly<Record<string, string>> = {},
): PromptBindings {
  const result = canonicalize({ values, slots }) as unknown as PromptBindings;
  verifyPromptBindings(result);
  return result;
}

export function verifyPromptSlotBinding(value: unknown): asserts value is PromptSlotBinding {
  const binding = object(value, "PromptSlotBinding");
  name(binding.name, "PromptSlotBinding.name");
}

export function sealPromptSlotBinding(value: PromptSlotBinding): PromptSlotBinding {
  const result = canonicalize(value) as unknown as PromptSlotBinding;
  verifyPromptSlotBinding(result);
  return result;
}

export function validatePromptValues(
  template: PromptTemplate,
  values: Readonly<Record<string, string>>,
  subject: string,
): void {
  verifyPromptTemplate(template);
  const choices = new Map(template.parts.filter((part) => part.kind === "choice")
    .map((part) => [part.name, part]));
  for (const [key, selected] of Object.entries(values)) {
    const choice = choices.get(key);
    assert(choice !== undefined, `${subject} names unknown choice ${key}`);
    assert(choice.options.some((option) => option.name === selected),
      `${subject}.${key} selects unsupported option ${selected}`);
  }
}

export function bindPromptSlot(
  bindings: PromptBindings,
  binding: PromptSlotBinding,
  text: Text,
): PromptBindings {
  verifyPromptBindings(bindings);
  verifyPromptSlotBinding(binding);
  verifyText(text);
  assert(bindings.slots[binding.name] === undefined, `Prompt slot ${binding.name} is already bound`);
  return sealPromptBindings(bindings.values, { ...bindings.slots, [binding.name]: text.value });
}

export function renderPrompt(template: PromptTemplate, bindings: PromptBindings): Prompt {
  verifyPromptTemplate(template);
  verifyPromptBindings(bindings);
  validatePromptValues(template, bindings.values, "Prompt bindings");
  const slots = new Set(template.parts.filter((part) => part.kind === "slot").map((part) => part.name));
  for (const key of Object.keys(bindings.slots)) {
    assert(slots.has(key), `Prompt bindings name unknown slot ${key}`);
  }
  const paragraphs = template.parts.flatMap((part): string[] => {
    if (part.kind === "fixed") return [part.text];
    if (part.kind === "choice") {
      const selected = bindings.values[part.name] ?? part.default;
      return [part.options.find((option) => option.name === selected)!.text];
    }
    const value = bindings.slots[part.name];
    if (value === undefined || value.trim().length === 0) {
      assert(!part.required, `Prompt slot ${part.name} is required`);
      return [];
    }
    return [part.label === undefined ? value : `${part.label}\n${value}`];
  });
  return sealPrompt(paragraphs.join("\n\n"));
}
