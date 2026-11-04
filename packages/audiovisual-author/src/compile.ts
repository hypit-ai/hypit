import {
  assertProgramSource,
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
import { assertLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  resolveExactTemporalRelation,
  sealLocalTemporalDomain,
} from "@hypit/temporal/algebra";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualAuthorAudioExpression,
  AudiovisualAuthorAudioProgram,
  AudiovisualAuthorBindings,
  AudiovisualAuthorOccurrence,
  AudiovisualAuthorPictureExpression,
  AudiovisualAuthorPictureProgram,
  AudiovisualAuthorSpec,
} from "./types.js";

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

function programDomain(spec: AudiovisualAuthorSpec): LocalTemporalDomain {
  assertIdentity(spec.id, "Audiovisual Author Spec id");
  const id = `${spec.id}:time`;
  assertIdentity(id, `Audiovisual Author Spec ${spec.id} generated temporal domain`);
  return sealLocalTemporalDomain({ id, duration: spec.duration });
}

function occurrenceDuration(
  id: string,
  declaration: AudiovisualAuthorOccurrence,
  source: ProgramSource,
): ExactTemporalValue {
  if (declaration.duration !== undefined) {
    assertExactTemporalValue(declaration.duration, `Author Occurrence ${id} duration`);
    return structuredClone(declaration.duration);
  }
  const selected = sortedEntries(declaration.outputs);
  assert(selected.length > 0, `Author Occurrence ${id} selects no Source outputs.`);
  for (const [output, selection] of selected) {
    assert(selection.relation === undefined,
      `Author Occurrence ${id}.${output} requires an explicit duration when a relation is authored.`);
  }
  const durations = selected.map(([output]) => {
    const value = Object.hasOwn(source.outputs, output) ? source.outputs[output] : undefined;
    assert(value !== undefined, `Author Occurrence ${id} selects missing Source output ${output}.`);
    assert(value.kind === "signal",
      `Author Occurrence ${id}.${output} is constant; author its occurrence duration explicitly.`);
    return value.domain.duration;
  });
  const first = durations[0];
  assert(first !== undefined, `Author Occurrence ${id} selects no Source outputs.`);
  assert(durations.every((duration) => exactEqual(duration, first)),
    `Author Occurrence ${id} selects differently sized Source outputs; author duration explicitly.`);
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

function compileOccurrence(
  id: string,
  declaration: AudiovisualAuthorOccurrence,
  parent: LocalTemporalDomain,
  spec: AudiovisualAuthorSpec,
  bindings: AudiovisualAuthorBindings,
): Occurrence {
  assertIdentity(id, "Author Occurrence id");
  assertExactTemporalValue(declaration.at, `Author Occurrence ${id} at`);
  const source = resolveAuthorSource(declaration.source, spec, bindings);
  const duration = occurrenceDuration(id, declaration, source);
  const localId = `${spec.id}:occurrence:${id}:time`;
  assertIdentity(localId, `Author Occurrence ${id} generated temporal domain`);
  const domain = sealLocalTemporalDomain({ id: localId, duration });
  const outputEntries = sortedEntries(declaration.outputs);
  assert(outputEntries.length > 0, `Author Occurrence ${id} selects no Source outputs.`);
  const selections = Object.fromEntries(outputEntries.map(([name, selection]) => {
    assertIdentity(name, `Author Occurrence ${id} output`);
    const output = Object.hasOwn(source.outputs, name) ? source.outputs[name] : undefined;
    assert(output !== undefined, `Author Occurrence ${id} selects missing Source output ${name}.`);
    if (output.kind === "constant") {
      assert(selection.relation === undefined,
        `Author Occurrence ${id}.${name} is constant and cannot have a temporal relation.`);
      return [name, { kind: "constant" as const }];
    }
    return [name, { kind: "signal" as const, mapping: resolveExactTemporalRelation({
      target: domain,
      source: output.domain,
      ...(selection.relation === undefined ? {} : { spec: selection.relation }),
    }),
    ...(selection.reconstruction === undefined ? {} : (() => {
      assertIdentity(selection.reconstruction, `Author Occurrence ${id}.${name} reconstruction binding`);
      const reconstruction = bindings.reconstructions?.[selection.reconstruction];
      assert(reconstruction !== undefined,
        `Author Occurrence ${id}.${name} has no resolved reconstruction ${selection.reconstruction}.`);
      return { reconstruction: structuredClone(reconstruction) };
    })()) }];
  }));
  return sealOccurrence({
    id,
    source,
    domain,
    placement: {
      parent,
      start: structuredClone(declaration.at),
      active: { start: exactTemporalZero(), end: structuredClone(duration) },
    },
    selections,
  });
}

type NamedState = "visiting" | "done";

function compilePicture(
  authored: AudiovisualAuthorPictureProgram,
  bindings: AudiovisualAuthorBindings,
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
        mapping: structuredClone(expression.mapping),
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
          controlBindings: structuredClone(expression.controlBindings),
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
          controlBindings: structuredClone(expression.controlBindings),
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

/** Resolve one syntax-neutral Author Spec into the complete factual audiovisual IR. */
export function compileAudiovisualAuthorSpec(
  spec: AudiovisualAuthorSpec,
  bindings: AudiovisualAuthorBindings,
): AudiovisualProgram {
  const domain = programDomain(spec);
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
  const occurrences = Object.fromEntries(sortedEntries(spec.occurrences).map(([id, declaration]) => {
    usedSources.add(declaration.source);
    return [id, compileOccurrence(id, declaration, domain, spec, bindings)];
  }));
  for (const [alias, declaration] of sortedEntries(spec.sources)) {
    assertIdentity(alias, "Author Source name");
    assertIdentity(declaration.binding, `Author Source ${alias} binding`);
    assert(usedSources.has(alias), `Author Source ${alias} is unused.`);
  }

  return sealAudiovisualProgram({
    id: spec.id,
    domain,
    ...(spec.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(spec.pictureDomain) }),
    occurrences,
    ...(spec.picture === undefined ? {} : { picture: compilePicture(spec.picture, bindings) }),
    ...(spec.audio === undefined ? {} : { audio: compileAudio(spec.audio, bindings) }),
  });
}
