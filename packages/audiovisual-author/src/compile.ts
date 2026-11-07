import {
  assertOccurrence,
  assertProgramSource,
  occurrenceParentRange,
  sealAudiovisualProgram,
  sealOccurrence,
} from "@hypit/audiovisual";
import type {
  AudioGraph,
  AudioNode,
  AudiovisualProgram,
  Occurrence,
  PictureGraph,
  PictureNode,
  ProgramSource,
} from "@hypit/audiovisual";
import { assertLocalSpatialDomain, assertSpatialMap } from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  assertTemporalMapRegionSet,
  compareExactTemporalValues,
  composeTemporalMaps,
  exactTemporalZero,
  identityTemporalMap,
  preimageTemporalMapRegions,
  resolveExactTemporalRelation,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
  uniqueTemporalMapRegionSetPoint,
} from "@hypit/temporal/algebra";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualAuthorAudioExpression,
  AudiovisualAuthorAudioProgram,
  AudiovisualAuthorBindings,
  AudiovisualAuthorControlBinding,
  AudiovisualAuthorOccurrenceBoundSpec,
  AudiovisualAuthorOccurrenceOutputSpec,
  AudiovisualAuthorOccurrence,
  AudiovisualAuthorOccurrenceSet,
  AudiovisualAuthorOccurrenceUse,
  AudiovisualAuthorOccurrenceUseSpec,
  AudiovisualAuthorPictureExpression,
  AudiovisualAuthorPictureProgram,
  AudiovisualAuthorProgramDomainSpec,
  AudiovisualAuthorSourceBoundSpec,
  AudiovisualAuthorSpec,
} from "./types.js";
import { resolveAudiovisualAuthorValue } from "./bindings.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function exactEqual(left: ExactTemporalValue, right: ExactTemporalValue): boolean {
  return compareExactTemporalValues(left, right) === 0;
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedEntries<Value>(value: Readonly<Record<string, Value>>): readonly [string, Value][] {
  return Object.entries(value).sort(([left], [right]) => compareNames(left, right));
}

export function createAudiovisualAuthorProgramDomain(
  spec: AudiovisualAuthorProgramDomainSpec,
  duration: ExactTemporalValue,
): LocalTemporalDomain {
  assertIdentity(spec.id, "Audiovisual Author Programme id");
  assertExactTemporalValue(duration, `Audiovisual Author Programme ${spec.id} duration`);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    `Audiovisual Author Programme ${spec.id} duration must be positive.`);
  const id = `${spec.id}:time`;
  assertIdentity(id, `Audiovisual Author Programme ${spec.id} generated temporal domain`);
  return sealLocalTemporalDomain({ id, duration });
}

export function inferAudiovisualAuthorOccurrenceDuration(
  spec: AudiovisualAuthorOccurrenceUseSpec,
  source: ProgramSource,
): ExactTemporalValue {
  assertIdentity(spec.id, "Author Occurrence id");
  assertIdentity(spec.domainId, `Author Occurrence ${spec.id} Domain id`);
  assertProgramSource(source);
  const selected = sortedEntries(spec.outputs);
  assert(selected.length > 0, `Author Occurrence ${spec.id} selects no Source outputs.`);
  for (const [output, selection] of selected) {
    assert(selection.relation === undefined,
      `Author Occurrence ${spec.id}.${output} requires an explicit duration when a relation is authored.`);
  }
  const durations = selected.map(([output]) => {
    const value = Object.hasOwn(source.outputs, output) ? source.outputs[output] : undefined;
    assert(value !== undefined, `Author Occurrence ${spec.id} selects missing Source output ${output}.`);
    assert(value.kind === "signal",
      `Author Occurrence ${spec.id}.${output} is constant; author its occurrence duration explicitly.`);
    return value.domain.duration;
  });
  const first = durations[0];
  assert(first !== undefined, `Author Occurrence ${spec.id} selects no Source outputs.`);
  assert(durations.every((duration) => exactEqual(duration, first)),
    `Author Occurrence ${spec.id} selects differently sized Source outputs; author duration explicitly.`);
  return structuredClone(first);
}

function resolveAuthorSource(
  alias: string,
  spec: AudiovisualAuthorSpec,
  bindings: AudiovisualAuthorBindings,
): ProgramSource {
  assertIdentity(alias, "Author Occurrence Source reference");
  const declaration = Object.hasOwn(spec.sources, alias) ? spec.sources[alias] : undefined;
  assert(declaration !== undefined, `Author Occurrence references missing Source ${alias}.`);
  assertIdentity(declaration.binding, `Author Source ${alias} binding`);
  const source = Object.hasOwn(bindings.sources, declaration.binding)
    ? bindings.sources[declaration.binding] : undefined;
  assert(source !== undefined,
    `Author Source ${alias} has no resolved binding ${declaration.binding}.`);
  assertProgramSource(source);
  return source;
}

export function resolveAudiovisualAuthorOccurrenceUse(
  spec: AudiovisualAuthorOccurrenceUseSpec,
  source: ProgramSource,
  start: ExactTemporalValue,
  duration: ExactTemporalValue,
  bindings: AudiovisualAuthorBindings,
): AudiovisualAuthorOccurrenceUse {
  assertIdentity(spec.id, "Author Occurrence id");
  assertIdentity(spec.domainId, `Author Occurrence ${spec.id} Domain id`);
  assertProgramSource(source);
  assertExactTemporalValue(start, `Author Occurrence ${spec.id} start`);
  assert(compareExactTemporalValues(start, exactTemporalZero()) >= 0,
    `Author Occurrence ${spec.id} begins before the Programme origin.`);
  assertExactTemporalValue(duration, `Author Occurrence ${spec.id} duration`);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    `Author Occurrence ${spec.id} duration must be positive.`);
  const localId = spec.domainId;
  assertIdentity(localId, `Author Occurrence ${spec.id} generated temporal domain`);
  const domain = sealLocalTemporalDomain({ id: localId, duration });
  const outputEntries = sortedEntries(spec.outputs);
  assert(outputEntries.length > 0, `Author Occurrence ${spec.id} selects no Source outputs.`);
  const selections = Object.fromEntries(outputEntries.map(([name, selection]) => {
    assertIdentity(name, `Author Occurrence ${spec.id} output`);
    const output = Object.hasOwn(source.outputs, name) ? source.outputs[name] : undefined;
    assert(output !== undefined, `Author Occurrence ${spec.id} selects missing Source output ${name}.`);
    if (output.kind === "constant") {
      assert(selection.relation === undefined,
        `Author Occurrence ${spec.id}.${name} is constant and cannot have a temporal relation.`);
      return [name, { kind: "constant" as const }];
    }
    return [name, { kind: "signal" as const, mapping: resolveExactTemporalRelation({
      target: domain,
      source: output.domain,
      ...(selection.relation === undefined ? {} : { spec: selection.relation }),
    }),
    ...(selection.reconstruction === undefined ? {} : (() => {
      assertIdentity(selection.reconstruction, `Author Occurrence ${spec.id}.${name} reconstruction binding`);
      const reconstruction = bindings.reconstructions?.[selection.reconstruction];
      assert(reconstruction !== undefined,
        `Author Occurrence ${spec.id}.${name} has no resolved reconstruction ${selection.reconstruction}.`);
      return { reconstruction: structuredClone(reconstruction) };
    })()) }];
  }));
  return {
    id: spec.id,
    source: structuredClone(source),
    domain,
    start: structuredClone(start),
    active: { start: exactTemporalZero(), end: structuredClone(duration) },
    selections,
  };
}

export function audiovisualAuthorOccurrenceUseEnd(
  use: AudiovisualAuthorOccurrenceUse,
): ExactTemporalValue {
  const activeDuration = subtractExactTemporalValues(use.active.end, use.active.start);
  return addExactTemporalValues(use.start, activeDuration);
}

export function assertAudiovisualAuthorOccurrenceUse(
  use: AudiovisualAuthorOccurrenceUse,
): void {
  assertIdentity(use.id, "Author Occurrence Use id");
  assertProgramSource(use.source);
  assertLocalTemporalDomain(use.domain);
  assertExactTemporalValue(use.start, `Author Occurrence ${use.id} start`);
  assert(compareExactTemporalValues(use.start, exactTemporalZero()) >= 0,
    `Author Occurrence ${use.id} begins before the Programme origin.`);
  const end = audiovisualAuthorOccurrenceUseEnd(use);
  const validationParent = sealLocalTemporalDomain({ id: "validation-parent", duration: end });
  sealOccurrence({
    id: use.id,
    source: use.source,
    domain: use.domain,
    placement: {
      parent: validationParent,
      start: use.start,
      active: use.active,
    },
    selections: use.selections,
  });
}

export function assertAudiovisualAuthorOccurrenceSet(
  occurrences: AudiovisualAuthorOccurrenceSet,
): void {
  assert(occurrences !== null && typeof occurrences === "object" && !Array.isArray(occurrences),
    "Audiovisual Author Occurrence Set must be an object.");
  for (const [id, occurrence] of Object.entries(occurrences)) {
    assertIdentity(id, "Audiovisual Author Occurrence Set id");
    assertOccurrence(occurrence);
    assert(occurrence.id === id,
      `Audiovisual Author Occurrence Set key ${id} contains Occurrence ${occurrence.id}.`);
  }
}

export function projectAudiovisualAuthorOccurrenceUsePosition(
  use: AudiovisualAuthorOccurrenceUse,
  local: ExactTemporalValue,
): ExactTemporalValue {
  assertExactTemporalValue(local, `Author Occurrence ${use.id} local position`);
  assert(compareExactTemporalValues(local, use.active.start) >= 0
    && compareExactTemporalValues(local, use.active.end) <= 0,
  `Author Occurrence ${use.id} local position lies outside its active range.`);
  return addExactTemporalValues(use.start, subtractExactTemporalValues(local, use.active.start));
}

function sameTemporalDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id && exactEqual(left.duration, right.duration);
}

export function bindAudiovisualAuthorOccurrenceUseToSource(
  spec: AudiovisualAuthorSourceBoundSpec,
  target: AudiovisualAuthorOccurrenceUse,
  source: ProgramSource,
): AudiovisualAuthorOccurrenceUse {
  assertIdentity(spec.id, "Source-bound Author Occurrence id");
  assertIdentity(spec.targetOutput, `Source-bound Author Occurrence ${spec.id} target output`);
  assertProgramSource(source);
  const followed = target.selections[spec.targetOutput];
  assert(followed?.kind === "signal",
    `Source-bound Author Occurrence ${spec.id} requires signal output ${target.id}.${spec.targetOutput}.`);
  const followedDomain = followed.mapping.stages.at(-1)!.source;
  assert(spec.outputs.length > 0, `Source-bound Author Occurrence ${spec.id} selects no outputs.`);
  const selections = Object.fromEntries(spec.outputs.map((name) => {
    assertIdentity(name, `Source-bound Author Occurrence ${spec.id} output`);
    const output = source.outputs[name];
    assert(output?.kind === "signal",
      `Source-bound Author Occurrence ${spec.id}.${name} must be a signal output.`);
    assert(sameTemporalDomain(output.domain, followedDomain),
      `Source-bound Author Occurrence ${spec.id}.${name} reads ${output.domain.id}, not bound domain ${followedDomain.id}.`);
    return [name, { kind: "signal" as const, mapping: structuredClone(followed.mapping) }];
  }));
  return {
    id: spec.id,
    source: structuredClone(source),
    domain: structuredClone(target.domain),
    start: structuredClone(target.start),
    active: structuredClone(target.active),
    selections,
  };
}

export function bindAudiovisualAuthorOccurrenceUseToOccurrence(
  spec: AudiovisualAuthorOccurrenceBoundSpec,
  target: AudiovisualAuthorOccurrenceUse,
  source: ProgramSource,
): AudiovisualAuthorOccurrenceUse {
  assertIdentity(spec.id, "Occurrence-bound Author Occurrence id");
  assertAudiovisualAuthorOccurrenceUse(target);
  assertProgramSource(source);
  assert(spec.outputs.length > 0, `Occurrence-bound Author Occurrence ${spec.id} selects no outputs.`);
  const selections = Object.fromEntries(spec.outputs.map((name) => {
    assertIdentity(name, `Occurrence-bound Author Occurrence ${spec.id} output`);
    const output = source.outputs[name];
    assert(output !== undefined, `Occurrence-bound Author Occurrence ${spec.id} selects missing output ${name}.`);
    if (output.kind === "constant") return [name, { kind: "constant" as const }];
    assert(sameTemporalDomain(output.domain, target.domain),
      `Occurrence-bound Author Occurrence ${spec.id}.${name} reads ${output.domain.id}, not occurrence domain ${target.domain.id}.`);
    return [name, { kind: "signal" as const, mapping: identityTemporalMap(output.domain) }];
  }));
  return {
    id: spec.id,
    source: structuredClone(source),
    domain: structuredClone(target.domain),
    start: structuredClone(target.start),
    active: structuredClone(target.active),
    selections,
  };
}

export function projectAudiovisualAuthorOccurrenceUseOutputMapping(
  spec: AudiovisualAuthorOccurrenceOutputSpec,
  use: AudiovisualAuthorOccurrenceUse,
): import("@hypit/temporal/algebra").TemporalMap {
  assertIdentity(spec.output, `Author Occurrence ${use.id} projected output`);
  assertAudiovisualAuthorOccurrenceUse(use);
  const selection = use.selections[spec.output];
  assert(selection?.kind === "signal",
    `Author Occurrence ${use.id}.${spec.output} has no signal Mapping.`);
  return structuredClone(selection.mapping);
}

export function closeAudiovisualAuthorOccurrence(
  use: AudiovisualAuthorOccurrenceUse,
  parent: LocalTemporalDomain,
): Occurrence {
  const end = audiovisualAuthorOccurrenceUseEnd(use);
  assert(compareExactTemporalValues(end, parent.duration) <= 0,
    `Author Occurrence ${use.id} lies outside Programme domain ${parent.id}.`);
  return sealOccurrence({
    id: use.id,
    source: structuredClone(use.source),
    domain: structuredClone(use.domain),
    placement: {
      parent: structuredClone(parent),
      start: structuredClone(use.start),
      active: structuredClone(use.active),
    },
    selections: structuredClone(use.selections),
  });
}

function occurrenceControlMapping(
  programDomain: LocalTemporalDomain,
  occurrence: Occurrence,
): TemporalMap {
  return sealTemporalMap({ stages: [{
    target: structuredClone(programDomain),
    source: structuredClone(occurrence.domain),
    pieces: [{
      target: occurrenceParentRange(occurrence),
      sourceAtStart: structuredClone(occurrence.placement.active.start),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
}

function compileControlMappings(
  authored: Readonly<Record<string, AudiovisualAuthorControlBinding>>,
  controls: Readonly<Record<string, LocalTemporalDomain>>,
  programDomain: LocalTemporalDomain,
  occurrences: AudiovisualAuthorOccurrenceSet,
  bindings: AudiovisualAuthorBindings,
  label: string,
): Readonly<Record<string, TemporalMap>> {
  for (const name of Object.keys(controls)) {
    assert(Object.hasOwn(authored, name), `${label} is missing Control binding ${name}.`);
  }
  return Object.fromEntries(sortedEntries(authored).map(([name, binding]) => {
    assertIdentity(name, `${label} Control name`);
    const controlDomain = Object.hasOwn(controls, name) ? controls[name] : undefined;
    assert(controlDomain !== undefined, `${label} binds undeclared Control ${name}.`);
    switch (binding.kind) {
      case "program": return [name, identityTemporalMap(programDomain)];
      case "occurrence": {
        const occurrence = occurrences[binding.occurrence];
        assert(occurrence !== undefined,
          `${label} Control ${name} references missing Occurrence ${binding.occurrence}.`);
        return [name, occurrenceControlMapping(programDomain, occurrence)];
      }
      case "source": {
        const occurrence = occurrences[binding.occurrence];
        assert(occurrence !== undefined,
          `${label} Control ${name} references missing Occurrence ${binding.occurrence}.`);
        const selection = occurrence.selections[binding.output];
        assert(selection?.kind === "signal",
          `${label} Control ${name} Source output ${binding.output} has no temporal Mapping.`);
        return [name, composeTemporalMaps(
          occurrenceControlMapping(programDomain, occurrence),
          selection.mapping,
        )];
      }
      case "relation": return [name, resolveExactTemporalRelation({
        target: programDomain,
        source: controlDomain,
        spec: binding.relation,
      })];
      case "mapping": return [name, resolveAudiovisualAuthorValue(binding.mapping, bindings,
        (value) => assertTemporalMap(value), `${label} Control ${name} Mapping`)];
    }
  }));
}

type NamedState = "visiting" | "done";

function compilePicture(
  authored: AudiovisualAuthorPictureProgram,
  bindings: AudiovisualAuthorBindings,
  programDomain: LocalTemporalDomain,
  occurrences: AudiovisualAuthorOccurrenceSet,
): PictureGraph {
  const declarations = authored.bindings ?? {};
  const nodes: Record<string, PictureNode> = {};
  const roots = new Map<string, string>();
  const states = new Map<string, NamedState>();
  const used = new Set<string>();
  let nextNode = 0;
  const allocate = (): string => `picture:node:${nextNode++}`;

  const compileDeclaration = (name: string): string => {
    assertIdentity(name, "Author Picture binding name");
    used.add(name);
    const existing = roots.get(name);
    if (existing !== undefined) return existing;
    assert(states.get(name) !== "visiting", `Author Picture bindings contain a cycle through ${name}.`);
    const expression = Object.hasOwn(declarations, name) ? declarations[name] : undefined;
    assert(expression !== undefined, `Author Picture references missing binding ${name}.`);
    states.set(name, "visiting");
    const root = compileExpression(expression, `picture:binding:${name}`);
    roots.set(name, root);
    states.set(name, "done");
    return root;
  };

  const put = (node: PictureNode, preferred?: string): string => {
    const id = preferred ?? allocate();
    assertIdentity(id, "Generated Picture node id");
    assert(!Object.hasOwn(nodes, id), `Generated Picture node ${id} is duplicated.`);
    nodes[id] = node;
    return id;
  };

  function compileExpression(expression: AudiovisualAuthorPictureExpression, preferred?: string): string {
    switch (expression.kind) {
      case "reference": return compileDeclaration(expression.name);
      case "transparent": return put({ kind: "transparent" }, preferred);
      case "use": return put({
        kind: "use", occurrence: expression.occurrence, output: expression.output,
      }, preferred);
      case "restrict": return put({
        kind: "restrict",
        input: compileExpression(expression.input),
        range: structuredClone(expression.range),
      }, preferred);
      case "crop": return put({
        kind: "crop",
        input: compileExpression(expression.input),
        region: structuredClone(expression.region),
      }, preferred);
      case "remap": return put({
        kind: "remap",
        input: compileExpression(expression.input),
        mapping: resolveAudiovisualAuthorValue(expression.mapping, bindings,
          assertSpatialMap, "Author Picture remap"),
      }, preferred);
      case "over": return put({
        kind: "over",
        inputs: expression.inputs.map((input) => compileExpression(input)),
      }, preferred);
      case "apply": {
        assertIdentity(expression.operator, "Author Picture Operator binding");
        const operator = bindings.pictureOperators?.[expression.operator];
        assert(operator !== undefined,
          `Author Picture Operator ${expression.operator} has no resolved binding.`);
        return put({
          kind: "apply",
          operator: structuredClone(operator),
          inputs: Object.fromEntries(sortedEntries(expression.inputs)
            .map(([name, input]) => [name, compileExpression(input)])),
          controlMappings: compileControlMappings(expression.controlBindings,
            operator.temporalControls, programDomain, occurrences, bindings,
            `Author Picture Operator ${expression.operator}`),
        }, preferred);
      }
    }
  }

  const root = compileExpression(authored.output, "picture:output");
  for (const name of Object.keys(declarations)) {
    assertIdentity(name, "Author Picture binding name");
    assert(used.has(name), `Author Picture binding ${name} is unused.`);
  }
  return { nodes, root };
}

function compileAudio(
  authored: AudiovisualAuthorAudioProgram,
  bindings: AudiovisualAuthorBindings,
  programDomain: LocalTemporalDomain,
  occurrences: AudiovisualAuthorOccurrenceSet,
): AudioGraph {
  const declarations = authored.bindings ?? {};
  const nodes: Record<string, AudioNode> = {};
  const roots = new Map<string, string>();
  const states = new Map<string, NamedState>();
  const used = new Set<string>();
  let nextNode = 0;
  const allocate = (): string => `audio:node:${nextNode++}`;

  const compileDeclaration = (name: string): string => {
    assertIdentity(name, "Author Audio binding name");
    used.add(name);
    const existing = roots.get(name);
    if (existing !== undefined) return existing;
    assert(states.get(name) !== "visiting", `Author Audio bindings contain a cycle through ${name}.`);
    const expression = Object.hasOwn(declarations, name) ? declarations[name] : undefined;
    assert(expression !== undefined, `Author Audio references missing binding ${name}.`);
    states.set(name, "visiting");
    const root = compileExpression(expression, `audio:binding:${name}`);
    roots.set(name, root);
    states.set(name, "done");
    return root;
  };

  const put = (node: AudioNode, preferred?: string): string => {
    const id = preferred ?? allocate();
    assertIdentity(id, "Generated Audio node id");
    assert(!Object.hasOwn(nodes, id), `Generated Audio node ${id} is duplicated.`);
    nodes[id] = node;
    return id;
  };

  function compileExpression(expression: AudiovisualAuthorAudioExpression, preferred?: string): string {
    switch (expression.kind) {
      case "reference": return compileDeclaration(expression.name);
      case "silence": return put({ kind: "silence" }, preferred);
      case "use": return put({
        kind: "use", occurrence: expression.occurrence, output: expression.output,
      }, preferred);
      case "restrict": return put({
        kind: "restrict",
        input: compileExpression(expression.input),
        range: structuredClone(expression.range),
      }, preferred);
      case "mix": return put({
        kind: "mix",
        inputs: expression.inputs.map((input) => compileExpression(input)),
      }, preferred);
      case "apply": {
        assertIdentity(expression.operator, "Author Audio Operator binding");
        const operator = bindings.audioOperators?.[expression.operator];
        assert(operator !== undefined,
          `Author Audio Operator ${expression.operator} has no resolved binding.`);
        return put({
          kind: "apply",
          operator: structuredClone(operator),
          inputs: Object.fromEntries(sortedEntries(expression.inputs)
            .map(([name, input]) => [name, compileExpression(input)])),
          controlMappings: compileControlMappings(expression.controlBindings,
            operator.temporalControls, programDomain, occurrences, bindings,
            `Author Audio Operator ${expression.operator}`),
        }, preferred);
      }
    }
  }

  const root = compileExpression(authored.output, "audio:output");
  for (const name of Object.keys(declarations)) {
    assertIdentity(name, "Author Audio binding name");
    assert(used.has(name), `Author Audio binding ${name} is unused.`);
  }
  return { nodes, root };
}

/** Seal already resolved author relations into the factual audiovisual IR. */
export function closeResolvedAudiovisualAuthorProgram(
  spec: AudiovisualAuthorSpec,
  bindings: AudiovisualAuthorBindings,
  domain: LocalTemporalDomain,
  occurrences: AudiovisualAuthorOccurrenceSet,
): AudiovisualProgram {
  assert(spec.picture !== undefined || spec.audio !== undefined,
    `Audiovisual Author Spec ${spec.id} has no outputs.`);
  if (spec.picture === undefined) {
    assert(spec.pictureDomain === undefined,
      `Audio-only Audiovisual Author Spec ${spec.id} contains an unused Picture domain.`);
  } else {
    assert(spec.pictureDomain !== undefined,
      `Audiovisual Author Spec ${spec.id} Picture has no output spatial domain.`);
    resolveAudiovisualAuthorValue(spec.pictureDomain, bindings,
      (value) => assertLocalSpatialDomain(value), `Audiovisual Author Spec ${spec.id} Picture domain`);
  }

  const expectedOccurrenceIds = Object.keys(spec.occurrences).sort(compareNames);
  const actualOccurrenceIds = Object.keys(occurrences).sort(compareNames);
  assert(JSON.stringify(expectedOccurrenceIds) === JSON.stringify(actualOccurrenceIds),
    `Audiovisual Author Spec ${spec.id} resolved Occurrences do not match its author structure.`);
  for (const [id, occurrence] of sortedEntries(occurrences)) {
    const declaration = spec.occurrences[id]!;
    const sourceDeclaration = spec.sources[declaration.source];
    assert(sourceDeclaration !== undefined,
      `Author Occurrence ${id} references missing Source ${declaration.source}.`);
    assert(occurrence.id === id, `Resolved Author Occurrence ${id} has identity ${occurrence.id}.`);
  }

  return sealAudiovisualProgram({
    id: spec.id,
    domain,
    ...(spec.pictureDomain === undefined ? {} : { pictureDomain: resolveAudiovisualAuthorValue(
      spec.pictureDomain, bindings, (value) => assertLocalSpatialDomain(value),
      `Audiovisual Author Spec ${spec.id} Picture domain`,
    ) }),
    occurrences,
    ...(spec.picture === undefined ? {} : { picture: compilePicture(spec.picture, bindings, domain, occurrences) }),
    ...(spec.audio === undefined ? {} : { audio: compileAudio(spec.audio, bindings, domain, occurrences) }),
  });
}

/** Resolve one syntax-neutral Author Spec into the complete factual audiovisual IR. */
export function compileAudiovisualAuthorSpec(
  spec: AudiovisualAuthorSpec,
  bindings: AudiovisualAuthorBindings,
): AudiovisualProgram {
  const duration = resolveAudiovisualAuthorValue(
    spec.duration,
    bindings,
    assertExactTemporalValue,
    `Audiovisual Author Spec ${spec.id} duration`,
  );
  const domain = createAudiovisualAuthorProgramDomain({ id: spec.id }, duration);
  const usedSources = new Set<string>();
  const uses = new Map<string, AudiovisualAuthorOccurrenceUse>();
  const states = new Map<string, "visiting" | "done">();
  const resolveUse = (id: string): AudiovisualAuthorOccurrenceUse => {
    const existing = uses.get(id);
    if (existing !== undefined) return existing;
    assert(states.get(id) !== "visiting", `Author Occurrence time bindings contain a cycle through ${id}.`);
    const declaration = spec.occurrences[id];
    assert(declaration !== undefined, `Author Occurrence time binding references missing Occurrence ${id}.`);
    states.set(id, "visiting");
    usedSources.add(declaration.source);
    const source = resolveAuthorSource(declaration.source, spec, bindings);
    const useSpec: AudiovisualAuthorOccurrenceUseSpec = {
      id,
      domainId: `${spec.id}:occurrence:${id}:time`,
      outputs: declaration.outputs,
    };
    let use: AudiovisualAuthorOccurrenceUse;
    if (declaration.time?.kind === "source") {
      use = bindAudiovisualAuthorOccurrenceUseToSource({
        id, targetOutput: declaration.time.output, outputs: Object.keys(declaration.outputs),
      }, resolveUse(declaration.time.occurrence), source);
    } else if (declaration.time?.kind === "occurrence") {
      use = bindAudiovisualAuthorOccurrenceUseToOccurrence({
        id, outputs: Object.keys(declaration.outputs),
      }, resolveUse(declaration.time.occurrence), source);
    } else {
      const useDuration = declaration.duration === undefined
        ? inferAudiovisualAuthorOccurrenceDuration(useSpec, source)
        : resolveAudiovisualAuthorValue(declaration.duration, bindings,
          assertExactTemporalValue, `Author Occurrence ${id} duration`);
      let start: ExactTemporalValue;
      if (declaration.time?.kind === "event") {
        const target = resolveUse(declaration.time.occurrence);
        const mapping = projectAudiovisualAuthorOccurrenceUseOutputMapping({
          output: declaration.time.output,
        }, target);
        const event = resolveAudiovisualAuthorValue(declaration.time.event, bindings,
          assertTemporalMapRegionSet, `Author Occurrence ${id} event`);
        const local = uniqueTemporalMapRegionSetPoint(preimageTemporalMapRegions(mapping,
          event));
        start = projectAudiovisualAuthorOccurrenceUsePosition(target, local.position);
        if (declaration.time.offset !== undefined) {
          start = addExactTemporalValues(start, resolveAudiovisualAuthorValue(
            declaration.time.offset, bindings, assertExactTemporalValue,
            `Author Occurrence ${id} event offset`,
          ));
        }
      } else {
        assert(declaration.at !== undefined, `Author Occurrence ${id} has no authored start.`);
        start = resolveAudiovisualAuthorValue(declaration.at, bindings,
          assertExactTemporalValue, `Author Occurrence ${id} at`);
      }
      use = resolveAudiovisualAuthorOccurrenceUse(useSpec, source, start, useDuration, bindings);
    }
    states.set(id, "done");
    uses.set(id, use);
    return use;
  };
  const occurrences = Object.fromEntries(sortedEntries(spec.occurrences).map(([id]) =>
    [id, closeAudiovisualAuthorOccurrence(resolveUse(id), domain)]));
  for (const [alias, declaration] of sortedEntries(spec.sources)) {
    assertIdentity(alias, "Author Source name");
    assertIdentity(declaration.binding, `Author Source ${alias} binding`);
    assert(usedSources.has(alias), `Author Source ${alias} is unused.`);
  }
  return closeResolvedAudiovisualAuthorProgram(spec, bindings, domain, occurrences);
}
