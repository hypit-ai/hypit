import { assertLocalSpatialDomain, assertSpatialMap, assertSpatialRegion } from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  assertExactTemporalRelationSpec,
  assertExactTemporalValue,
  assertTemporalMap,
  assertTemporalMapRegionSet,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualAuthorAudioExpression,
  AudiovisualAuthorControlBinding,
  AudiovisualAuthorOccurrenceBoundSpec,
  AudiovisualAuthorOccurrenceOutputSpec,
  AudiovisualAuthorOccurrenceUseSpec,
  AudiovisualAuthorPictureExpression,
  AudiovisualAuthorProgramDomainSpec,
  AudiovisualAuthorSourceBoundSpec,
  AudiovisualAuthorSpec,
  AudiovisualAuthorValue,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertAudiovisualAuthorOccurrenceUseSpec(
  spec: AudiovisualAuthorOccurrenceUseSpec,
): void {
  assert(spec !== null && typeof spec === "object" && !Array.isArray(spec),
    "Audiovisual Author Occurrence Use Spec must be an object.");
  assertIdentity(spec.id, "Audiovisual Author Occurrence Use id");
  assertIdentity(spec.domainId, `Audiovisual Author Occurrence Use ${spec.id} Domain id`);
  const outputs = Object.entries(spec.outputs);
  assert(outputs.length > 0,
    `Audiovisual Author Occurrence Use ${spec.id} selects no Source outputs.`);
  for (const [name, output] of outputs) {
    assertIdentity(name, `Audiovisual Author Occurrence Use ${spec.id} output`);
    assert(output !== null && typeof output === "object" && !Array.isArray(output),
      `Audiovisual Author Occurrence Use ${spec.id}.${name} must be an object.`);
    if (output.relation !== undefined) {
      assertExactTemporalRelationSpec(output.relation,
        `Audiovisual Author Occurrence Use ${spec.id}.${name} relation`);
    }
    if (output.reconstruction !== undefined) {
      assertIdentity(output.reconstruction,
        `Audiovisual Author Occurrence Use ${spec.id}.${name} reconstruction`);
    }
  }
}

function assertBoundOutputs(id: string, outputsValue: readonly string[], label: string): void {
  assert(Array.isArray(outputsValue) && outputsValue.length > 0,
    `${label} ${id} selects no Source outputs.`);
  const outputs = new Set<string>();
  for (const output of outputsValue) {
    assertIdentity(output, `${label} ${id} output`);
    assert(!outputs.has(output), `${label} ${id} repeats Source output ${output}.`);
    outputs.add(output);
  }
}

export function assertAudiovisualAuthorSourceBoundSpec(spec: AudiovisualAuthorSourceBoundSpec): void {
  assert(spec !== null && typeof spec === "object" && !Array.isArray(spec),
    "Audiovisual Author Source-bound Spec must be an object.");
  assertIdentity(spec.id, "Audiovisual Author Source-bound id");
  assertIdentity(spec.targetOutput, `Audiovisual Author Source-bound ${spec.id} target output`);
  assertBoundOutputs(spec.id, spec.outputs, "Audiovisual Author Source-bound");
}

export function assertAudiovisualAuthorOccurrenceBoundSpec(spec: AudiovisualAuthorOccurrenceBoundSpec): void {
  assert(spec !== null && typeof spec === "object" && !Array.isArray(spec),
    "Audiovisual Author Occurrence-bound Spec must be an object.");
  assertIdentity(spec.id, "Audiovisual Author Occurrence-bound id");
  assertBoundOutputs(spec.id, spec.outputs, "Audiovisual Author Occurrence-bound");
}

export function assertAudiovisualAuthorOccurrenceOutputSpec(spec: AudiovisualAuthorOccurrenceOutputSpec): void {
  assert(spec !== null && typeof spec === "object" && !Array.isArray(spec),
    "Audiovisual Author Occurrence Output Spec must be an object.");
  assertIdentity(spec.output, "Audiovisual Author Occurrence Output");
}

export function assertAudiovisualAuthorProgramDomainSpec(
  spec: AudiovisualAuthorProgramDomainSpec,
): void {
  assert(spec !== null && typeof spec === "object" && !Array.isArray(spec),
    "Audiovisual Author Programme Domain Spec must be an object.");
  assertIdentity(spec.id, "Audiovisual Author Programme Domain id");
}

function literal<Value>(value: AudiovisualAuthorValue<Value>): Value | undefined {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "binding"
    ? undefined : value as Value;
}

function assertAuthorValue<Value>(value: AudiovisualAuthorValue<Value>, label: string,
  validate: (value: Value, label: string) => void): void {
  if (typeof value === "object" && value !== null && "kind" in value && value.kind === "binding") {
    assertIdentity(value.name, `${label} binding`);
    return;
  }
  validate(value as Value, label);
}

function assertRange(
  range: { readonly start: import("@hypit/temporal/algebra").ExactTemporalValue;
    readonly end: import("@hypit/temporal/algebra").ExactTemporalValue },
  label: string,
): void {
  assertExactTemporalValue(range.start, `${label}.start`);
  assertExactTemporalValue(range.end, `${label}.end`);
  assert(compareExactTemporalValues(range.start, range.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(range.start, exactTemporalZero()) >= 0,
    `${label} begins before zero.`);
}

function assertAuthorControlBindings(
  bindings: Readonly<Record<string, AudiovisualAuthorControlBinding>>,
  spec: AudiovisualAuthorSpec,
  label: string,
): void {
  assert(bindings !== null && typeof bindings === "object" && !Array.isArray(bindings),
    `${label} Control bindings must be an object.`);
  for (const [name, binding] of Object.entries(bindings)) {
    assertIdentity(name, `${label} Control name`);
    assert(binding !== null && typeof binding === "object" && !Array.isArray(binding),
      `${label} Control ${name} binding must be an object.`);
    switch (binding.kind) {
      case "program": break;
      case "occurrence": {
        assertIdentity(binding.occurrence, `${label} Control ${name} Occurrence`);
        assert(Object.hasOwn(spec.occurrences, binding.occurrence),
          `${label} Control ${name} references missing Occurrence ${binding.occurrence}.`);
        break;
      }
      case "source": {
        assertIdentity(binding.occurrence, `${label} Control ${name} Occurrence`);
        assertIdentity(binding.output, `${label} Control ${name} Source output`);
        const occurrence = Object.hasOwn(spec.occurrences, binding.occurrence)
          ? spec.occurrences[binding.occurrence] : undefined;
        assert(occurrence !== undefined,
          `${label} Control ${name} references missing Occurrence ${binding.occurrence}.`);
        assert(Object.hasOwn(occurrence.outputs, binding.output),
          `${label} Control ${name} references unselected Source output ${binding.output}.`);
        break;
      }
      case "relation":
        assertExactTemporalRelationSpec(binding.relation, `${label} Control ${name} relation`);
        break;
      case "mapping":
        assertAuthorValue(binding.mapping, `${label} Control ${name} Mapping`,
          (value) => assertTemporalMap(value));
        break;
      default: throw new Error(`${label} Control ${name} binding kind is invalid.`);
    }
  }
}

function assertPictureAuthorGraph(
  spec: AudiovisualAuthorSpec,
  usedOccurrences: Set<string>,
): void {
  const graph = spec.picture;
  if (graph === undefined) return;
  const bindings = graph.bindings ?? {};
  const usedBindings = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visitBinding = (name: string): void => {
    assertIdentity(name, "Author Picture binding name");
    usedBindings.add(name);
    if (visited.has(name)) return;
    assert(!visiting.has(name), `Author Picture bindings contain a cycle through ${name}.`);
    const expression = Object.hasOwn(bindings, name) ? bindings[name] : undefined;
    assert(expression !== undefined, `Author Picture references missing binding ${name}.`);
    visiting.add(name);
    visit(expression, `Author Picture binding ${name}`);
    visiting.delete(name);
    visited.add(name);
  };

  const visit = (expression: AudiovisualAuthorPictureExpression, label: string): void => {
    switch (expression.kind) {
      case "transparent": return;
      case "reference": visitBinding(expression.name); return;
      case "use":
        assertIdentity(expression.occurrence, `${label} Occurrence`);
        assertIdentity(expression.output, `${label} output`);
        assert(Object.hasOwn(spec.occurrences, expression.occurrence),
          `${label} references missing Occurrence ${expression.occurrence}.`);
        usedOccurrences.add(expression.occurrence);
        return;
      case "restrict":
        assertRange(expression.range, `${label} restrict`);
        visit(expression.input, `${label} input`);
        return;
      case "crop":
        assertSpatialRegion(expression.region, `${label} crop`);
        visit(expression.input, `${label} input`);
        return;
      case "remap":
        assertAuthorValue(expression.mapping, `${label} remap`, (value) => assertSpatialMap(value));
        visit(expression.input, `${label} input`);
        return;
      case "over":
        assert(expression.inputs.length > 0, `${label} over has no inputs.`);
        expression.inputs.forEach((input, index) => visit(input, `${label} over ${index}`));
        return;
      case "apply":
        assertIdentity(expression.operator, `${label} Operator binding`);
        assert(Object.keys(expression.inputs).length > 0, `${label} apply has no inputs.`);
        for (const [port, input] of Object.entries(expression.inputs)) {
          assertIdentity(port, `${label} Operator port`);
          visit(input, `${label}.${port}`);
        }
        assertAuthorControlBindings(expression.controlBindings, spec, `${label} apply`);
        return;
    }
  };

  visit(graph.output, "Author Picture output");
  for (const name of Object.keys(bindings)) {
    assertIdentity(name, "Author Picture binding name");
    assert(usedBindings.has(name), `Author Picture binding ${name} is unused.`);
  }
}

function assertAudioAuthorGraph(
  spec: AudiovisualAuthorSpec,
  usedOccurrences: Set<string>,
): void {
  const graph = spec.audio;
  if (graph === undefined) return;
  const bindings = graph.bindings ?? {};
  const usedBindings = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visitBinding = (name: string): void => {
    assertIdentity(name, "Author Audio binding name");
    usedBindings.add(name);
    if (visited.has(name)) return;
    assert(!visiting.has(name), `Author Audio bindings contain a cycle through ${name}.`);
    const expression = Object.hasOwn(bindings, name) ? bindings[name] : undefined;
    assert(expression !== undefined, `Author Audio references missing binding ${name}.`);
    visiting.add(name);
    visit(expression, `Author Audio binding ${name}`);
    visiting.delete(name);
    visited.add(name);
  };

  const visit = (expression: AudiovisualAuthorAudioExpression, label: string): void => {
    switch (expression.kind) {
      case "silence": return;
      case "reference": visitBinding(expression.name); return;
      case "use":
        assertIdentity(expression.occurrence, `${label} Occurrence`);
        assertIdentity(expression.output, `${label} output`);
        assert(Object.hasOwn(spec.occurrences, expression.occurrence),
          `${label} references missing Occurrence ${expression.occurrence}.`);
        usedOccurrences.add(expression.occurrence);
        return;
      case "restrict":
        assertRange(expression.range, `${label} restrict`);
        visit(expression.input, `${label} input`);
        return;
      case "mix":
        assert(expression.inputs.length > 0, `${label} mix has no inputs.`);
        expression.inputs.forEach((input, index) => visit(input, `${label} mix ${index}`));
        return;
      case "apply":
        assertIdentity(expression.operator, `${label} Operator binding`);
        assert(Object.keys(expression.inputs).length > 0, `${label} apply has no inputs.`);
        for (const [port, input] of Object.entries(expression.inputs)) {
          assertIdentity(port, `${label} Operator port`);
          visit(input, `${label}.${port}`);
        }
        assertAuthorControlBindings(expression.controlBindings, spec, `${label} apply`);
        return;
    }
  };

  visit(graph.output, "Author Audio output");
  for (const name of Object.keys(bindings)) {
    assertIdentity(name, "Author Audio binding name");
    assert(usedBindings.has(name), `Author Audio binding ${name} is unused.`);
  }
}

/** Validate only author facts and references; no future Source value is needed. */
export function assertAudiovisualAuthorSpec(spec: AudiovisualAuthorSpec): void {
  assertIdentity(spec.id, "Audiovisual Author Spec id");
  assertAuthorValue(spec.duration, `Audiovisual Author Spec ${spec.id} duration`, assertExactTemporalValue);
  const programDuration = literal(spec.duration);
  if (programDuration !== undefined) assert(compareExactTemporalValues(programDuration, exactTemporalZero()) > 0,
    `Audiovisual Author Spec ${spec.id} duration must be positive.`);
  assert(spec.picture !== undefined || spec.audio !== undefined,
    `Audiovisual Author Spec ${spec.id} has no outputs.`);
  if (spec.picture === undefined) {
    assert(spec.pictureDomain === undefined,
      `Audio-only Audiovisual Author Spec ${spec.id} contains an unused Picture domain.`);
  } else {
    assert(spec.pictureDomain !== undefined,
      `Audiovisual Author Spec ${spec.id} Picture has no output spatial domain.`);
    assertAuthorValue(spec.pictureDomain, `Audiovisual Author Spec ${spec.id} Picture domain`,
      (value) => assertLocalSpatialDomain(value));
  }

  const usedSources = new Set<string>();
  for (const [id, occurrence] of Object.entries(spec.occurrences)) {
    assertIdentity(id, "Author Occurrence id");
    assertIdentity(occurrence.source, `Author Occurrence ${id} Source`);
    assert(Object.hasOwn(spec.sources, occurrence.source),
      `Author Occurrence ${id} references missing Source ${occurrence.source}.`);
    usedSources.add(occurrence.source);
    assert((occurrence.at === undefined) !== (occurrence.time === undefined),
      `Author Occurrence ${id} must declare exactly one of at or time binding.`);
    if (occurrence.time !== undefined) {
      assertIdentity(occurrence.time.occurrence, `Author Occurrence ${id} time target`);
      assert(Object.hasOwn(spec.occurrences, occurrence.time.occurrence),
        `Author Occurrence ${id} time binding references missing Occurrence ${occurrence.time.occurrence}.`);
      assert(occurrence.time.occurrence !== id,
        `Author Occurrence ${id} time binding references itself.`);
      if (occurrence.time.kind === "source" || occurrence.time.kind === "event") {
        assertIdentity(occurrence.time.output, `Author Occurrence ${id} time target output`);
      }
      if (occurrence.time.kind === "event") {
        assert(occurrence.time.require === "unique",
          `Author Occurrence ${id} event binding must explicitly require one solution.`);
        assertAuthorValue(occurrence.time.event, `Author Occurrence ${id} event`, assertTemporalMapRegionSet);
        if (occurrence.time.offset !== undefined) {
          assertAuthorValue(occurrence.time.offset, `Author Occurrence ${id} event offset`, assertExactTemporalValue);
        }
      }
    }
    if (occurrence.time?.kind === "source" || occurrence.time?.kind === "occurrence") {
      assert(occurrence.duration === undefined,
        `Author Occurrence ${id} ${occurrence.time.kind}-bound duration comes from its target.`);
    }
    if (occurrence.time !== undefined && occurrence.time.kind !== "event") {
      for (const [name, output] of Object.entries(occurrence.outputs)) {
        assert(output.relation === undefined,
          `Author Occurrence ${id}.${name} cannot add a relation to a ${occurrence.time.kind}-bound use.`);
        assert(output.reconstruction === undefined,
          `Author Occurrence ${id}.${name} cannot reconstruct a ${occurrence.time.kind}-bound use.`);
      }
    }
    const occurrenceAt = occurrence.at === undefined ? undefined : literal(occurrence.at);
    if (occurrence.at !== undefined) {
      assertAuthorValue(occurrence.at, `Author Occurrence ${id} at`, assertExactTemporalValue);
    }
    if (occurrenceAt !== undefined) assert(compareExactTemporalValues(occurrenceAt, exactTemporalZero()) >= 0,
      `Author Occurrence ${id} begins before the Programme.`);
    if (occurrence.duration !== undefined) {
      assertAuthorValue(occurrence.duration, `Author Occurrence ${id} duration`, assertExactTemporalValue);
      const occurrenceDuration = literal(occurrence.duration);
      if (occurrenceDuration !== undefined) assert(compareExactTemporalValues(occurrenceDuration, exactTemporalZero()) > 0,
        `Author Occurrence ${id} duration must be positive.`);
      if (occurrenceAt !== undefined && occurrenceDuration !== undefined && programDuration !== undefined) {
        assert(compareExactTemporalValues(addExactTemporalValues(occurrenceAt, occurrenceDuration), programDuration) <= 0,
          `Author Occurrence ${id} lies outside Author Programme ${spec.id}.`);
      }
    }
    assert(Object.keys(occurrence.outputs).length > 0,
      `Author Occurrence ${id} selects no Source outputs.`);
    for (const [name, output] of Object.entries(occurrence.outputs)) {
      assertIdentity(name, `Author Occurrence ${id} output`);
      if (output.relation !== undefined) {
        assert(occurrence.duration !== undefined,
          `Author Occurrence ${id}.${name} requires an explicit duration when a relation is authored.`);
        assertExactTemporalRelationSpec(output.relation, `Author Occurrence ${id}.${name} relation`);
      }
      if (output.reconstruction !== undefined) {
        assertIdentity(output.reconstruction, `Author Occurrence ${id}.${name} reconstruction binding`);
      }
    }
  }
  for (const [name, source] of Object.entries(spec.sources)) {
    assertIdentity(name, "Author Source name");
    assertIdentity(source.binding, `Author Source ${name} binding`);
    assert(usedSources.has(name), `Author Source ${name} is unused.`);
  }

  const usedOccurrences = new Set<string>();
  assertPictureAuthorGraph(spec, usedOccurrences);
  assertAudioAuthorGraph(spec, usedOccurrences);
  for (const id of Object.keys(spec.occurrences)) {
    assert(usedOccurrences.has(id), `Author Occurrence ${id} is unused.`);
  }
}
