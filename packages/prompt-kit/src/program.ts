import { canonicalize, digestOf, isDigest } from "@svml/protocol";

import type {
  PromptKitAxisBlock,
  PromptKitBlockSpec,
  PromptKitChoice,
  PromptKitInvocation,
  PromptKitScalar,
  PromptKitSpec,
  PromptProgram,
  PromptProgramBlock,
} from "./types.js";

const ID = /^[a-z][a-z0-9-]{0,95}$/u;

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object`);
  }
  return value as Record<string, unknown>;
}

function scalar(value: unknown, subject: string): asserts value is PromptKitScalar {
  if (
    typeof value !== "string"
    && typeof value !== "boolean"
    && !(typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error(`${subject} must be a finite scalar`);
  }
}

function scalarMap(value: unknown, subject: string): asserts value is Readonly<Record<string, PromptKitScalar>> {
  const record = object(value, subject);
  for (const [name, item] of Object.entries(record)) {
    if (!ID.test(name)) throw new Error(`${subject} contains invalid key ${name}`);
    scalar(item, `${subject}.${name}`);
  }
}

function stringMap(value: unknown, subject: string): asserts value is Readonly<Record<string, string>> {
  const record = object(value, subject);
  for (const [name, item] of Object.entries(record)) {
    if (!ID.test(name) || typeof item !== "string" || item.length === 0) {
      throw new Error(`${subject}.${name} must be a non-empty string`);
    }
  }
}

function choice(value: unknown, subject: string): asserts value is PromptKitChoice {
  const item = object(value, subject);
  if (!ID.test(String(item.id ?? "")) || typeof item.text !== "string" || item.text.length === 0) {
    throw new Error(`${subject} identity or text is invalid`);
  }
  const when = object(item.when, `${subject}.when`);
  scalarMap(when.parameters, `${subject}.when.parameters`);
  stringMap(when.selectors, `${subject}.when.selectors`);
}

function block(value: unknown, subject: string): asserts value is PromptKitBlockSpec {
  const item = object(value, subject);
  if (!ID.test(String(item.id ?? "")) || !Number.isSafeInteger(item.order) || Number(item.order) < 0) {
    throw new Error(`${subject} identity or order is invalid`);
  }
  if (item.kind === "fixed") {
    if (typeof item.text !== "string" || item.text.length === 0) throw new Error(`${subject}.text is empty`);
    return;
  }
  if (item.kind === "axis") {
    if (!ID.test(String(item.parameter ?? "")) || !Array.isArray(item.choices) || item.choices.length === 0) {
      throw new Error(`${subject} axis is invalid`);
    }
    item.choices.forEach((entry, index) => choice(entry, `${subject}.choices[${index}]`));
    const choices = item.choices as readonly PromptKitChoice[];
    if (choices.some((entry) => Object.keys(entry.when.parameters).length > 0 || Object.keys(entry.when.selectors).length > 0)) {
      throw new Error(`${subject} axis choices cannot carry conditions`);
    }
    return;
  }
  if (item.kind === "variant") {
    if (!Array.isArray(item.choices) || item.choices.length === 0) throw new Error(`${subject} variant has no choices`);
    item.choices.forEach((entry, index) => choice(entry, `${subject}.choices[${index}]`));
    return;
  }
  if (item.kind === "slot") {
    if (!ID.test(String(item.slot ?? "")) || typeof item.optional !== "boolean") {
      throw new Error(`${subject} slot is invalid`);
    }
    if (item.label !== undefined && (typeof item.label !== "string" || item.label.length === 0)) {
      throw new Error(`${subject}.label must be a non-empty string`);
    }
    return;
  }
  throw new Error(`${subject}.kind is invalid`);
}

function specContent(value: Omit<PromptKitSpec, "specDigest">) {
  return canonicalize(value);
}

export function sealPromptKitSpec(value: Omit<PromptKitSpec, "specDigest">): PromptKitSpec {
  const result = { ...value, specDigest: digestOf(specContent(value)) };
  verifyPromptKitSpec(result);
  return result;
}

export function verifyPromptKitSpec(value: unknown): asserts value is PromptKitSpec {
  const spec = object(value, "PromptKitSpec") as PromptKitSpec;
  if (
    spec.contract !== "svml.prompt-kit-spec@1"
    || !ID.test(spec.id)
    || spec.separator !== "\n\n"
    || !Array.isArray(spec.blocks)
    || spec.blocks.length === 0
    || !isDigest(spec.specDigest)
  ) {
    throw new Error("PromptKitSpec header is invalid");
  }
  scalarMap(spec.defaults, "PromptKitSpec.defaults");
  spec.blocks.forEach((item, index) => block(item, `PromptKitSpec.blocks[${index}]`));
  const ids = spec.blocks.map((item) => item.id);
  const orders = spec.blocks.map((item) => item.order);
  if (new Set(ids).size !== ids.length || new Set(orders).size !== orders.length) {
    throw new Error("PromptKitSpec block ids and orders must be unique");
  }
  if (spec.blocks.some((item, index) => index > 0 && item.order <= spec.blocks[index - 1]!.order)) {
    throw new Error("PromptKitSpec blocks must be ordered strictly by order");
  }
  for (const item of spec.blocks) {
    if ((item.kind === "axis" || item.kind === "variant") && new Set(item.choices.map((entry: PromptKitChoice) => entry.id)).size !== item.choices.length) {
      throw new Error(`PromptKitSpec block ${item.id} has duplicate choices`);
    }
  }
  const { specDigest: _digest, ...content } = spec;
  if (spec.specDigest !== digestOf(specContent(content))) throw new Error("PromptKitSpec digest differs from its contents");
}

function invocationContent(value: Omit<PromptKitInvocation, "invocationDigest">) {
  return canonicalize(value);
}

export function sealPromptKitInvocation(
  value: Omit<PromptKitInvocation, "invocationDigest">,
): PromptKitInvocation {
  const result = { ...value, invocationDigest: digestOf(invocationContent(value)) };
  verifyPromptKitInvocation(result);
  return result;
}

export function verifyPromptKitInvocation(value: unknown): asserts value is PromptKitInvocation {
  const invocation = object(value, "PromptKitInvocation") as PromptKitInvocation;
  if (
    invocation.contract !== "svml.prompt-kit-invocation@1"
    || !ID.test(invocation.kit)
    || !isDigest(invocation.invocationDigest)
  ) {
    throw new Error("PromptKitInvocation header is invalid");
  }
  scalarMap(invocation.parameters, "PromptKitInvocation.parameters");
  stringMap(invocation.selectors, "PromptKitInvocation.selectors");
  stringMap(invocation.slots, "PromptKitInvocation.slots");
  const { invocationDigest: _digest, ...content } = invocation;
  if (invocation.invocationDigest !== digestOf(invocationContent(content))) {
    throw new Error("PromptKitInvocation digest differs from its contents");
  }
}

function programContent(value: Omit<PromptProgram, "programDigest">) {
  return canonicalize(value);
}

export function verifyPromptProgram(value: unknown): asserts value is PromptProgram {
  const program = object(value, "PromptProgram") as PromptProgram;
  if (
    program.contract !== "svml.prompt-program@1"
    || !ID.test(program.kit)
    || !isDigest(program.specDigest)
    || !isDigest(program.invocationDigest)
    || program.separator !== "\n\n"
    || !Array.isArray(program.blocks)
    || program.blocks.length === 0
    || !isDigest(program.programDigest)
  ) {
    throw new Error("PromptProgram header is invalid");
  }
  for (const [index, item] of program.blocks.entries()) {
    if (!ID.test(item.id) || typeof item.origin !== "string" || item.origin.length === 0 || typeof item.text !== "string" || item.text.length === 0) {
      throw new Error(`PromptProgram.blocks[${index}] is invalid`);
    }
  }
  if (new Set(program.blocks.map((item) => item.id)).size !== program.blocks.length) {
    throw new Error("PromptProgram block ids must be unique");
  }
  const { programDigest: _digest, ...content } = program;
  if (program.programDigest !== digestOf(programContent(content))) {
    throw new Error("PromptProgram digest differs from its contents");
  }
}

function conditionsMatch(
  choice: PromptKitChoice,
  parameters: Readonly<Record<string, PromptKitScalar>>,
  selectors: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(choice.when.parameters).every(([name, value]) => parameters[name] === value)
    && Object.entries(choice.when.selectors).every(([name, value]) => selectors[name] === value);
}

function knownInputs(spec: PromptKitSpec) {
  const parameters = new Set(Object.keys(spec.defaults));
  const selectors = new Set<string>();
  const slots = new Set<string>();
  for (const item of spec.blocks) {
    if (item.kind === "axis") parameters.add(item.parameter);
    if (item.kind === "variant") {
      for (const option of item.choices) {
        Object.keys(option.when.parameters).forEach((name) => parameters.add(name));
        Object.keys(option.when.selectors).forEach((name) => selectors.add(name));
      }
    }
    if (item.kind === "slot") slots.add(item.slot);
  }
  return { parameters, selectors, slots };
}

function axisBlock(
  item: PromptKitAxisBlock,
  parameters: Readonly<Record<string, PromptKitScalar>>,
): PromptProgramBlock {
  const value = parameters[item.parameter];
  if (value === undefined) throw new Error(`Prompt Kit parameter ${item.parameter} is required`);
  const selected = item.choices.filter((option) => option.id === String(value));
  if (selected.length !== 1) throw new Error(`Prompt Kit axis ${item.parameter} has no unique choice for ${String(value)}`);
  return { id: item.id, origin: `parameter:${item.parameter}:${String(value)}`, text: selected[0]!.text };
}

export function compilePromptKit(spec: PromptKitSpec, invocation: PromptKitInvocation): PromptProgram {
  verifyPromptKitSpec(spec);
  verifyPromptKitInvocation(invocation);
  if (invocation.kit !== spec.id) throw new Error(`Prompt Kit ${invocation.kit} does not match Spec ${spec.id}`);
  const known = knownInputs(spec);
  for (const name of Object.keys(invocation.parameters)) {
    if (!known.parameters.has(name)) throw new Error(`Prompt Kit parameter ${name} is not declared`);
  }
  for (const name of Object.keys(invocation.selectors)) {
    if (!known.selectors.has(name)) throw new Error(`Prompt Kit selector ${name} is not declared`);
  }
  for (const name of Object.keys(invocation.slots)) {
    if (!known.slots.has(name)) throw new Error(`Prompt Kit slot ${name} is not declared`);
  }
  const parameters = { ...spec.defaults, ...invocation.parameters };
  const blocks: PromptProgramBlock[] = [];
  for (const item of spec.blocks) {
    if (item.kind === "fixed") {
      blocks.push({ id: item.id, origin: `kit:${spec.id}:fixed`, text: item.text });
      continue;
    }
    if (item.kind === "axis") {
      blocks.push(axisBlock(item, parameters));
      continue;
    }
    if (item.kind === "variant") {
      const selected = item.choices.filter((option) => conditionsMatch(option, parameters, invocation.selectors));
      if (selected.length !== 1) throw new Error(`Prompt Kit variant ${item.id} matched ${selected.length} choices`);
      blocks.push({ id: item.id, origin: `variant:${item.id}:${selected[0]!.id}`, text: selected[0]!.text });
      continue;
    }
    const value = invocation.slots[item.slot]?.trim();
    if (value === undefined || value.length === 0) {
      if (!item.optional) throw new Error(`Prompt Kit slot ${item.slot} is required`);
      continue;
    }
    blocks.push({
      id: item.id,
      origin: `slot:${item.slot}`,
      text: item.label === undefined ? value : `${item.label}\n${value}`,
    });
  }
  const content: Omit<PromptProgram, "programDigest"> = {
    contract: "svml.prompt-program@1",
    kit: spec.id,
    specDigest: spec.specDigest,
    invocationDigest: invocation.invocationDigest,
    separator: spec.separator,
    blocks,
  };
  const program = { ...content, programDigest: digestOf(programContent(content)) };
  verifyPromptProgram(program);
  return program;
}
