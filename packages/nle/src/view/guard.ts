import type { NleCommand, NleTransaction } from "../transaction.js";
import { applyNleTransaction } from "../transaction.js";
import { indexNleProject } from "../indexing.js";
import type { NleComposition, NleItem, NleProject, NleTrack } from "../types.js";
import type { NleTimelineItemCapabilities, NleView } from "./types.js";
import { assertNleViewForProject, nleViewTrackLocked } from "./view.js";

type LocatedTrack = {
  readonly composition: NleComposition;
  readonly track: NleTrack;
};

type LocatedItem = LocatedTrack & {
  readonly item: NleItem;
};

function locateTrack(project: NleProject, id: string): LocatedTrack {
  for (const composition of project.compositions) {
    const track = composition.tracks.find((candidate) => candidate.id === id);
    if (track !== undefined) return { composition, track };
  }
  throw new Error(`Unknown NLE Track: ${id}.`);
}

function locateItem(project: NleProject, id: string): LocatedItem {
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      const item = track.items.find((candidate) => candidate.id === id);
      if (item !== undefined) return { composition, track, item };
    }
  }
  throw new Error(`Unknown NLE Item: ${id}.`);
}

function relationItems(project: NleProject, kind: "transition" | "matte", id: string): readonly string[] {
  for (const composition of project.compositions) {
    if (kind === "transition") {
      const relation = composition.transitions.find((candidate) => candidate.id === id);
      if (relation !== undefined) return [relation.outgoing, relation.incoming];
    } else {
      const relation = composition.mattes.find((candidate) => candidate.id === id);
      if (relation !== undefined) return [relation.content, relation.matte];
    }
  }
  throw new Error(`Unknown NLE ${kind === "transition" ? "Transition" : "Matte"}: ${id}.`);
}

function commandTracks(project: NleProject, command: NleCommand): readonly LocatedTrack[] {
  const items = (ids: readonly string[]) => ids.map((id) => locateItem(project, id));
  const tracks = (ids: readonly string[]) => ids.map((id) => locateTrack(project, id));
  switch (command.kind) {
    case "project.update":
    case "shared-value.add":
    case "composition.add":
    case "composition.update":
    case "track.add":
      return [];
    case "shared-value.replace":
      return indexNleProject(project).sharedValueUsers(command.value.id);
    case "shared-value.remove":
      return indexNleProject(project).sharedValueUsers(command.id);
    case "component-value-binding.set":
    case "component-value-binding.remove":
      return items([command.item]);
    case "composition.remove": {
      const composition = project.compositions.find((candidate) => candidate.id === command.id);
      if (composition === undefined) throw new Error(`Unknown NLE Composition: ${command.id}.`);
      return composition.tracks.map((track) => ({ composition, track }));
    }
    case "track.move":
    case "track.update":
    case "track.remove":
      return tracks([command.id]);
    case "item.add":
      return tracks([command.track]);
    case "item.update":
    case "item.trim":
    case "item.slip":
    case "item.retime":
      return items([command.id]);
    case "item.move":
      return [
        ...items(command.ids),
        ...tracks((command.destinations ?? []).map((destination) => destination.track)),
      ];
    case "item.roll":
      return items([command.left, command.right]);
    case "item.ripple-trim":
      return items([command.id, ...command.scope]);
    case "item.split":
      return items([command.id]);
    case "item.detach-audio":
      return [...items([command.id]), ...tracks([command.track])];
    case "process.add":
    case "process.move":
    case "process.replace":
    case "process.retime":
    case "process.remove":
      return items([command.item]);
    case "transition.add":
      return items([command.transition.outgoing, command.transition.incoming]);
    case "transition.replace":
      return items([
        ...relationItems(project, "transition", command.transition.id),
        command.transition.outgoing,
        command.transition.incoming,
      ]);
    case "transition.remove":
      return items(relationItems(project, "transition", command.id));
    case "matte.add":
      return items([command.matte.content, command.matte.matte]);
    case "matte.replace":
      return items([
        ...relationItems(project, "matte", command.matte.id),
        command.matte.content,
        command.matte.matte,
      ]);
    case "matte.remove":
      return items(relationItems(project, "matte", command.id));
    case "item.replace":
      return items([command.item.id]);
    case "item.remove":
      return items(command.ids);
    default:
      throw new Error(`Unknown NLE command: ${String((command as { readonly kind?: unknown }).kind)}.`);
  }
}

/**
 * Host-surface guard for Project edits initiated through this View.
 * The Project Service remains authoritative and can still be called by another explicit caller.
 */
export function assertNleViewAllowsProjectTransaction(
  view: NleView,
  project: NleProject,
  transaction: NleTransaction,
  capabilities?: readonly NleTimelineItemCapabilities[],
): void {
  assertNleViewForProject(view, project);
  const capabilityByItem = capabilities === undefined
    ? undefined
    : new Map(capabilities.map((value) => [value.item, value] as const));
  const requireCapability = (
    ids: readonly string[],
    capability: "move" | "trimStart" | "trimEnd" | "split",
  ): void => {
    if (capabilityByItem === undefined) return;
    for (const id of new Set(ids)) {
      if (capabilityByItem.get(id)?.[capability] !== true) {
        throw new Error(`NLE Timeline Item ${id} does not offer ${capability}.`);
      }
    }
  };
  const completed = applyNleTransaction(project, transaction);
  for (const command of transaction.commands) {
    if (command.kind === "item.move") requireCapability(command.ids, "move");
    else if (command.kind === "item.trim" || command.kind === "item.ripple-trim") {
      requireCapability([command.id], command.edge === "start" ? "trimStart" : "trimEnd");
      if (command.kind === "item.ripple-trim") requireCapability(command.scope, "move");
    } else if (command.kind === "item.roll") {
      requireCapability([command.left], "trimEnd");
      requireCapability([command.right], "trimStart");
    } else if (command.kind === "item.split") requireCapability([command.id], "split");
    const touched: LocatedTrack[] = [];
    for (const snapshot of [project, completed]) {
      try {
        touched.push(...commandTracks(snapshot, command));
      } catch {
        // A command may address a subject created or removed elsewhere in this same atomic transaction.
      }
    }
    const seen = new Set<string>();
    for (const { composition, track } of touched) {
      const key = `${composition.id}\0${track.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (nleViewTrackLocked(view, composition.id, track.id)) {
        throw new Error(
          `NLE View Track ${track.id} in Composition ${composition.id} is locked for ${command.kind}.`,
        );
      }
    }
  }
}
