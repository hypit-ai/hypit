import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import type { StudioViewRole, StudioTrackTrace } from "@hypit/studio-adapter";
import type { TypeRef } from "@hypit/protocol";

export type { StudioViewRole } from "@hypit/studio-adapter";

export type StudioTraceDependency = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
  readonly typeRef: TypeRef;
};

export type StudioTrace = StudioTrackTrace;

export type StudioOutput = {
  readonly name: string;
  readonly type: string;
  readonly typeRef: TypeRef;
  readonly ref: string;
};

function lastTag(placement: Placement | undefined): string {
  return placement?.tag.split(":").at(-1) ?? "";
}

export function outputFor(source: CompiledSource, ref: string): StudioOutput | undefined {
  return source.exports.find((item) => item.ref === ref);
}

export function referencedValueFor(source: CompiledSource, ref: string): StudioOutput | undefined {
  const output = outputFor(source, ref);
  if (output !== undefined) return output;
  const record = source.compiled.program.records.find((item) => item.id === ref);
  if (record === undefined) return undefined;
  const name = source.compiled.provenance.elements.flatMap((element) => element.records)
    .find((item) => item.id === ref)?.local ?? ref;
  return {
    name,
    type: record.type.name,
    typeRef: record.type,
    ref: record.id,
  };
}

export function placementFor(source: CompiledSource, ref: string): Placement | undefined {
  return source.observations.placements.find((item) => item.outputs.includes(ref));
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function lastPlacementTag(source: CompiledSource, ref: string): string {
  return lastTag(placementFor(source, ref));
}

export function roleFor(
  registry: StudioCompanionRegistry,
  source: CompiledSource,
  ref: string,
): StudioViewRole | undefined {
  const output = outputFor(source, ref);
  if (output === undefined) return undefined;
  const placement = placementFor(source, ref);
  const placementTypes = placement?.outputs.flatMap((candidate) => {
    const found = outputFor(source, candidate);
    return found === undefined ? [] : [found.typeRef];
  }) ?? [];
  return registry.classifyOutput(output.typeRef, placement, placementTypes);
}

export function traceFor(source: CompiledSource, ref: string): StudioTrace {
  const placement = placementFor(source, ref);
  if (placement === undefined) return { outputPorts: [], references: [] };
  const direct: Array<{ readonly input?: string; readonly dependency: string }> =
    Object.entries(placement.resolvedReferenceAttributes ?? {}).map(([input, dependency]) => ({ input, dependency }));
  const nested: Array<{ readonly input?: string; readonly dependency: string }> =
    placement.children.flatMap((child) => Object.values(child.resolvedReferenceAttributes ?? {})
      .map((dependency) => ({ dependency })));
  const dependencies = [...direct, ...nested].filter((candidate, index, all) =>
    all.findIndex((other) => other.dependency === candidate.dependency
      && other.input === candidate.input) === index);
  const refs = dependencies.flatMap(({ input, dependency }) => {
    const value = referencedValueFor(source, dependency);
    return value === undefined ? [] : [{
      ...(input === undefined ? {} : { input }),
      name: value.name, ref: value.ref, type: value.type, typeRef: value.typeRef,
    }];
  });
  return {
    placement: placement.tag,
    surface: placement.surface,
    module: { ...placement.module },
    ...(placement.id === undefined ? {} : { authoredId: placement.id }),
    outputPorts: placement.outputPorts.map((port) => {
      const output = outputFor(source, port.ref);
      return {
        name: port.name,
        ref: output?.ref ?? port.ref,
        ...(output?.type === undefined ? {} : { type: output.type }),
        ...(output?.typeRef === undefined ? {} : { typeRef: output.typeRef }),
      };
    }),
    references: refs,
  };
}

/** Additional same-Surface values a Companion requires beyond the terminal Track. */
export function tracedStudioValues(
  registry: StudioCompanionRegistry,
  source: CompiledSource,
  ref: string,
): readonly string[] {
  const output = outputFor(source, ref);
  const placement = placementFor(source, ref);
  if (output === undefined || placement === undefined) return [];
  const siblingTypes = placement.outputPorts.flatMap((port) => {
    const found = outputFor(source, port.ref);
    return found === undefined ? [] : [found.typeRef];
  });
  const ports = registry.requiredValuePorts(output.typeRef, placement, siblingTypes);
  return ports.map((name) => {
    const port = placement.outputPorts.find((candidate) => candidate.name === name);
    if (port === undefined) {
      throw new Error(`Studio Companion for ${output.type} requires missing ${placement.tag} output port ${name}`);
    }
    const found = outputFor(source, port.ref);
    if (found === undefined) {
      throw new Error(`Studio Companion for ${output.type} cannot resolve ${placement.tag} output port ${name}`);
    }
    return found.ref;
  });
}
