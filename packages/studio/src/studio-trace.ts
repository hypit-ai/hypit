import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import {
  classifyStudioOutput,
  studioRealizationPorts,
  studioDependencyRole,
} from "./studio-registry.js";
import type { StudioProjectionRole } from "./studio-registry.js";

export type { StudioProjectionRole } from "./studio-registry.js";

export type StudioTraceDependency = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
};

export type StudioTrace = {
  readonly placement?: string;
  readonly surface?: string;
  readonly module?: string;
  readonly authoredId?: string;
  readonly outputPorts: readonly { readonly name: string; readonly ref: string }[];
  readonly references: readonly StudioTraceDependency[];
};

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

export function roleFor(source: CompiledSource, ref: string): StudioProjectionRole | undefined {
  const output = outputFor(source, ref);
  if (output === undefined) return undefined;
  const placement = placementFor(source, ref);
  const placementTypes = placement?.outputs.flatMap((candidate) => {
    const found = outputFor(source, candidate);
    return found === undefined ? [] : [found.type];
  }) ?? [];
  return classifyStudioOutput(output.type, placement, placementTypes);
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
    outputPorts: placement.outputPorts.map((port) => ({
      name: port.name,
      ref: outputFor(source, port.ref)?.ref ?? port.ref,
    })),
    references: refs,
  };
}

/** Additional same-Surface realizations an adapter needs beyond the terminal Track. */
export function tracedStudioRealizations(source: CompiledSource, ref: string): readonly string[] {
  const output = outputFor(source, ref);
  const placement = placementFor(source, ref);
  if (output === undefined || placement === undefined) return [];
  const siblingTypes = placement.outputPorts.flatMap((port) => {
    const found = outputFor(source, port.ref);
    return found === undefined ? [] : [found.type];
  });
  const ports = new Set(studioRealizationPorts(output.type, placement, siblingTypes));
  return placement.outputPorts
    .filter((port) => ports.has(port.name))
    .flatMap((port) => {
      const found = outputFor(source, port.ref);
      return found === undefined ? [] : [found.ref];
    });
}

export function tracedRealizations(
  source: CompiledSource,
  ref: string,
): readonly { ref: string; role: StudioProjectionRole }[] {
  const role = roleFor(source, ref);
  if (role === undefined) return [];
  return traceFor(source, ref).references.flatMap((dependency) => {
    const dependencyRole = studioDependencyRole(role, dependency.type);
    return dependencyRole === undefined ? [] : [{ ref: dependency.ref, role: dependencyRole }];
  });
}
