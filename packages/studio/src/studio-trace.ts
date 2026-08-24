import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import type { StudioAdapterRegistry } from "./studio-registry.js";
import type { StudioProjectionRole, StudioTrackTrace } from "@hypit/studio-adapter";

export type { StudioProjectionRole } from "@hypit/studio-adapter";

export type StudioTraceDependency = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
};

export type StudioTrace = StudioTrackTrace;

export type StudioOutput = {
  readonly name: string;
  readonly type: string;
  readonly ref: string;
};

function lastTag(placement: Placement | undefined): string {
  return placement?.tag.split(":").at(-1) ?? "";
}

export function outputFor(source: CompiledSource, ref: string): StudioOutput | undefined {
  return source.exports.find((item) => item.ref === ref || item.name === ref);
}

export function placementFor(source: CompiledSource, ref: string): Placement | undefined {
  const output = outputFor(source, ref);
  return source.observations.placements.find((item) =>
    item.outputs.includes(ref) || (output !== undefined && item.outputs.includes(output.name))
  );
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function lastPlacementTag(source: CompiledSource, ref: string): string {
  return lastTag(placementFor(source, ref));
}

export function roleFor(
  registry: StudioAdapterRegistry,
  source: CompiledSource,
  ref: string,
): StudioProjectionRole | undefined {
  const output = outputFor(source, ref);
  if (output === undefined) return undefined;
  const placement = placementFor(source, ref);
  const placementTypes = placement?.outputs.flatMap((candidate) => {
    const found = outputFor(source, candidate);
    return found === undefined ? [] : [found.type];
  }) ?? [];
  return registry.classifyOutput(output.type, placement, placementTypes);
}

export function traceFor(source: CompiledSource, ref: string): StudioTrace {
  const placement = placementFor(source, ref);
  if (placement === undefined) return { outputPorts: [], references: [] };
  const refs = unique([
    ...placement.references,
    ...placement.children.flatMap((child) => child.references),
  ]).flatMap((dependency) => {
    const output = outputFor(source, dependency);
    return output === undefined ? [] : [{ name: output.name, ref: output.ref, type: output.type }];
  });
  return {
    placement: placement.tag,
    surface: placement.surface,
    module: placement.module.name,
    ...(placement.id === undefined ? {} : { authoredId: placement.id }),
    outputPorts: placement.outputPorts.map((port) => {
      const output = outputFor(source, port.ref);
      return {
        name: port.name,
        ref: output?.ref ?? port.ref,
        ...(output?.type === undefined ? {} : { type: output.type }),
      };
    }),
    references: refs,
  };
}

/** Additional same-Surface values a Companion requires beyond the terminal Track. */
export function tracedStudioValues(
  registry: StudioAdapterRegistry,
  source: CompiledSource,
  ref: string,
): readonly string[] {
  const output = outputFor(source, ref);
  const placement = placementFor(source, ref);
  if (output === undefined || placement === undefined) return [];
  const siblingTypes = placement.outputPorts.flatMap((port) => {
    const found = outputFor(source, port.ref);
    return found === undefined ? [] : [found.type];
  });
  const ports = registry.requiredValuePorts(output.type, placement, siblingTypes);
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
