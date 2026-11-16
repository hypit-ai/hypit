import { assertNleProject, findNleOperatorSharedValue, resolveNleOperatorParameters } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type { NleAdjustItem, NlePresentItem, NleProcess, NleProject } from "./types.js";

export type NleProcessTarget =
  | { readonly kind: "adjust"; readonly item: string }
  | {
      readonly kind: "present";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly process: string;
    };

export type NleProcessParameterEdit =
  | { readonly kind: "share"; readonly id: string; readonly name: string }
  | { readonly kind: "link"; readonly ref: string }
  | { readonly kind: "unlink" };

type LocatedProcess =
  | { readonly target: Extract<NleProcessTarget, { readonly kind: "adjust" }>; readonly item: NleAdjustItem; readonly process: NleProcess }
  | { readonly target: Extract<NleProcessTarget, { readonly kind: "present" }>; readonly item: NlePresentItem; readonly process: NleProcess };

function locate(project: NleProject, target: NleProcessTarget): LocatedProcess {
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      const item = track.items.find((candidate) => candidate.id === target.item);
      if (item === undefined) continue;
      if (target.kind === "adjust") {
        if (item.kind !== "adjust") throw new Error(`NLE Item ${target.item} is not an Adjust.`);
        return { target, item, process: item };
      }
      if (item.kind !== "present") throw new Error(`NLE Item ${target.item} is not a Present.`);
      const processes = target.medium === "picture" ? item.picture?.processes : item.audio?.processes;
      const process = processes?.find((candidate) => candidate.id === target.process);
      if (process === undefined) {
        throw new Error(`NLE Present ${target.item} has no ${target.medium} Process ${target.process}.`);
      }
      return { target, item, process };
    }
  }
  throw new Error(`Unknown NLE Item: ${target.item}.`);
}

function replacement(located: LocatedProcess, process: NleProcess): NleTransaction["commands"][number] {
  if (located.target.kind === "adjust") {
    return {
      kind: "item.replace",
      item: { ...structuredClone(located.item), parameters: process.parameters } as NleAdjustItem,
    };
  }
  return {
    kind: "process.replace",
    item: located.target.item,
    medium: located.target.medium,
    process,
  };
}

/** Plan explicit share, link or unlink of one package-owned Process parameter value. */
export function planNleProcessParameterEdit(
  project: NleProject,
  target: NleProcessTarget,
  edit: NleProcessParameterEdit,
): NleTransaction {
  assertNleProject(project);
  const located = locate(project, target);
  if (edit.kind === "share") {
    if (located.process.parameters.kind !== "inline") {
      throw new Error(`NLE Process ${located.process.id} already uses a Shared Value.`);
    }
    const process = {
      ...structuredClone(located.process),
      parameters: { kind: "shared" as const, ref: edit.id },
    };
    return { commands: [
      {
        kind: "shared-value.add",
        value: {
          id: edit.id,
          name: edit.name,
          declaration: { kind: "operator", operator: structuredClone(located.process.operator) },
          value: structuredClone(located.process.parameters.value),
        },
      },
      replacement(located, process),
    ] };
  }
  if (edit.kind === "link") {
    const value = findNleOperatorSharedValue(project, edit.ref);
    if (value.declaration.operator.package !== located.process.operator.package
      || value.declaration.operator.symbol !== located.process.operator.symbol) {
      throw new Error(`NLE Shared Value ${edit.ref} belongs to another Operator.`);
    }
    return { commands: [replacement(located, {
      ...structuredClone(located.process),
      parameters: { kind: "shared", ref: edit.ref },
    })] };
  }
  if (located.process.parameters.kind !== "shared") {
    throw new Error(`NLE Process ${located.process.id} already has inline parameters.`);
  }
  return { commands: [replacement(located, {
    ...structuredClone(located.process),
    parameters: {
      kind: "inline",
      value: resolveNleOperatorParameters(project, located.process.operator, located.process.parameters),
    },
  })] };
}
