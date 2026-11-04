import { assertLocalSpatialDomain, assertSpatialMap, assertSpatialRegion } from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  assertExactTemporalRelationSpec,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualAuthorAudioExpression,
  AudiovisualAuthorPictureExpression,
  AudiovisualAuthorSpec,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertRange(
  range: { readonly start: import("@hypit/temporal/algebra").ExactTemporalValue;
    readonly end: import("@hypit/temporal/algebra").ExactTemporalValue },
  spec: AudiovisualAuthorSpec,
  label: string,
): void {
  assertExactTemporalValue(range.start, `${label}.start`);
  assertExactTemporalValue(range.end, `${label}.end`);
  assert(compareExactTemporalValues(range.start, range.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(range.start, exactTemporalZero()) >= 0
    && compareExactTemporalValues(range.end, spec.duration) <= 0,
  `${label} lies outside Author Programme ${spec.id}.`);
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
        assertRange(expression.range, spec, `${label} restrict`);
        visit(expression.input, `${label} input`);
        return;
      case "crop":
        assertSpatialRegion(expression.region, `${label} crop`);
        visit(expression.input, `${label} input`);
        return;
      case "remap":
        assertSpatialMap(expression.mapping);
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
        assertRange(expression.range, spec, `${label} restrict`);
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
  assertExactTemporalValue(spec.duration, `Audiovisual Author Spec ${spec.id} duration`);
  assert(compareExactTemporalValues(spec.duration, exactTemporalZero()) > 0,
    `Audiovisual Author Spec ${spec.id} duration must be positive.`);
  assert(spec.picture !== undefined || spec.audio !== undefined,
    `Audiovisual Author Spec ${spec.id} has no outputs.`);
  if (spec.picture === undefined) {
    assert(spec.pictureDomain === undefined,
      `Audio-only Audiovisual Author Spec ${spec.id} contains an unused Picture domain.`);
  } else {
    assert(spec.pictureDomain !== undefined,
      `Audiovisual Author Spec ${spec.id} Picture has no output spatial domain.`);
    assertLocalSpatialDomain(spec.pictureDomain);
  }

  const usedSources = new Set<string>();
  for (const [id, occurrence] of Object.entries(spec.occurrences)) {
    assertIdentity(id, "Author Occurrence id");
    assertIdentity(occurrence.source, `Author Occurrence ${id} Source`);
    assert(Object.hasOwn(spec.sources, occurrence.source),
      `Author Occurrence ${id} references missing Source ${occurrence.source}.`);
    usedSources.add(occurrence.source);
    assertExactTemporalValue(occurrence.at, `Author Occurrence ${id} at`);
    assert(compareExactTemporalValues(occurrence.at, exactTemporalZero()) >= 0,
      `Author Occurrence ${id} begins before the Programme.`);
    if (occurrence.duration !== undefined) {
      assertExactTemporalValue(occurrence.duration, `Author Occurrence ${id} duration`);
      assert(compareExactTemporalValues(occurrence.duration, exactTemporalZero()) > 0,
        `Author Occurrence ${id} duration must be positive.`);
      assert(compareExactTemporalValues(addExactTemporalValues(occurrence.at, occurrence.duration), spec.duration) <= 0,
        `Author Occurrence ${id} lies outside Author Programme ${spec.id}.`);
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
