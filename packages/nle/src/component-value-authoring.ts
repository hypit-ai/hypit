import {
  assertNleProject,
  findNleComponentSharedValue,
  resolveNleComponentValue,
} from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleComponentItem,
  NleComponentValueBinding,
  NleProject,
} from "./types.js";

export type NleComponentValueEdit =
  | { readonly kind: "share"; readonly slot: string; readonly id: string; readonly name: string }
  | { readonly kind: "link"; readonly slot: string; readonly ref: string }
  | { readonly kind: "unlink"; readonly slot: string };

function componentItem(project: NleProject, itemId: string): NleComponentItem {
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      const item = track.items.find((candidate) => candidate.id === itemId);
      if (item === undefined) continue;
      if (item.kind !== "present" || item.source !== "component") {
        throw new Error(`NLE Item ${itemId} is not a Component Present.`);
      }
      return item;
    }
  }
  throw new Error(`Unknown NLE Item: ${itemId}.`);
}

function binding(item: NleComponentItem, slot: string): NleComponentValueBinding {
  const found = item.valueBindings?.find((candidate) => candidate.slot === slot);
  if (found === undefined) throw new Error(`NLE Component ${item.id} has no value slot ${slot}.`);
  return found;
}

/** Plan explicit sharing, linking or value-preserving unlinking of one package-owned Component value. */
export function planNleComponentValueEdit(
  project: NleProject,
  itemId: string,
  edit: NleComponentValueEdit,
): NleTransaction {
  assertNleProject(project);
  const item = componentItem(project, itemId);
  if (edit.kind === "share") {
    if (edit.id.trim().length === 0 || edit.name.trim().length === 0) {
      throw new Error("NLE shared Component value requires an id and name.");
    }
    if (project.sharedValues.some((candidate) => candidate.id === edit.id)) {
      throw new Error(`NLE Shared Value ${edit.id} already exists.`);
    }
    const current = binding(item, edit.slot);
    if (current.kind !== "inline") {
      throw new Error(`NLE Component ${itemId} slot ${edit.slot} already uses a Shared Value.`);
    }
    return { commands: [{
      kind: "shared-value.add",
      value: {
        id: edit.id,
        name: edit.name,
        declaration: {
          kind: "component",
          component: structuredClone(item.component),
          slot: edit.slot,
        },
        value: structuredClone(current.value),
      },
    }, {
      kind: "component-value-binding.set",
      item: itemId,
      binding: { slot: edit.slot, kind: "shared", ref: edit.id },
    }] };
  }
  if (edit.kind === "link") {
    const value = findNleComponentSharedValue(project, edit.ref);
    if (value.declaration.slot !== edit.slot
      || value.declaration.component.package !== item.component.package
      || value.declaration.component.symbol !== item.component.symbol) {
      throw new Error(`NLE Shared Value ${edit.ref} belongs to another Component slot.`);
    }
    return { commands: [{
      kind: "component-value-binding.set",
      item: itemId,
      binding: { slot: edit.slot, kind: "shared", ref: edit.ref },
    }] };
  }
  const current = binding(item, edit.slot);
  if (current.kind !== "shared") {
    throw new Error(`NLE Component ${itemId} slot ${edit.slot} already owns its value.`);
  }
  return { commands: [{
    kind: "component-value-binding.set",
    item: itemId,
    binding: {
      slot: edit.slot,
      kind: "inline",
      value: resolveNleComponentValue(project, item.component, current),
    },
  }] };
}
