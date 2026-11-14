import {
  indexNleComposition,
  type NleProject,
  type NleSpatialEdit,
} from "@hypit/nle";

import type { NleTimelineView } from "./types.js";
import { assertNleTimelineViewForProject } from "./view.js";

export type NleSpatialItemCapabilities = {
  readonly item: string;
  readonly owner:
    | { readonly kind: "item" }
    | {
        readonly kind: "picture-layout";
        readonly ref: string;
        readonly affectedItems: readonly string[];
      };
  /** Mutations of the currently owned Layout, including all users of a shared Layout. */
  readonly replaceLayout: boolean;
  readonly translateFrame: boolean;
  readonly resizeFrame: boolean;
  readonly setFit: boolean;
  readonly setFocus: boolean;
  /** Convert this Item's inline Layout into a named Project Layout. */
  readonly shareLayout: boolean;
  /** Rebind this Item to one of these existing Project Layouts. */
  readonly linkableLayouts: readonly { readonly id: string; readonly name: string }[];
  /** Copy the currently linked Project Layout back onto this Item. */
  readonly unlinkLayout: boolean;
};

export type NleCanvasAffordancePolicy = {
  readonly translateFrame: boolean;
  readonly resizeFrame: boolean;
};

/** Current Workbench direct handles; intentionally narrower than headless spatial authoring. */
/** Maximum direct Canvas frame gestures before one product applies its own smaller whitelist. */
export const allNleCanvasAffordances: NleCanvasAffordancePolicy = {
  translateFrame: true,
  resizeFrame: true,
};

/** Resolve the complete headless spatial ability; a product may expose only a subset as direct handles. */
export function resolveNleSpatialItemCapabilities(
  project: NleProject,
  view: NleTimelineView,
): readonly NleSpatialItemCapabilities[] {
  assertNleTimelineViewForProject(view, project);
  const index = indexNleComposition(project);
  const locked = new Set(view.tracks.filter((state) => state.locked).map((state) => state.track));
  return project.tracks.flatMap((track) => track.items.flatMap(
    (item): readonly NleSpatialItemCapabilities[] => {
    if (item.kind !== "present" || item.picture === undefined) return [];
    const itemWritable = !locked.has(track.id);
    if (!("ref" in item.picture.layout)) {
      return [{
        item: item.id,
        owner: { kind: "item" as const },
        replaceLayout: itemWritable,
        translateFrame: itemWritable,
        resizeFrame: itemWritable,
        setFit: itemWritable,
        setFocus: itemWritable,
        shareLayout: itemWritable,
        linkableLayouts: itemWritable
          ? project.pictureLayouts.map(({ id, name }) => ({ id, name }))
          : [],
        unlinkLayout: false,
      }];
    }
    const ref = item.picture.layout.ref;
    const users = index.pictureLayoutUsers(ref);
    const ownerWritable = users.every((user) => !locked.has(user.track.id));
    return [{
      item: item.id,
      owner: {
        kind: "picture-layout" as const,
        ref,
        affectedItems: users.map((user) => user.item.id),
      },
      replaceLayout: ownerWritable,
      translateFrame: ownerWritable,
      resizeFrame: ownerWritable,
      setFit: ownerWritable,
      setFocus: ownerWritable,
      shareLayout: false,
      linkableLayouts: itemWritable
        ? project.pictureLayouts.filter((candidate) => candidate.id !== ref)
          .map(({ id, name }) => ({ id, name }))
        : [],
      unlinkLayout: itemWritable,
    }];
    },
  ));
}

/** Guard one application command against the same semantic capability observation shown to callers. */
export function assertNleSpatialEditAllowed(
  capabilities: readonly NleSpatialItemCapabilities[],
  item: string,
  edit: NleSpatialEdit,
): void {
  const capability = capabilities.find((candidate) => candidate.item === item);
  if (capability === undefined) throw new Error(`NLE Item ${item} has no spatial authoring capability.`);
  const allowed = edit.kind === "layout.replace" ? capability.replaceLayout
    : edit.kind === "frame.translate" ? capability.translateFrame
      : edit.kind === "frame.resize" ? capability.resizeFrame
        : edit.kind === "fit.set" ? capability.setFit
          : edit.kind === "focus.set" ? capability.setFocus
            : edit.kind === "layout.share" ? capability.shareLayout
              : edit.kind === "layout.link"
                ? capability.linkableLayouts.some((candidate) => candidate.id === edit.ref)
                : capability.unlinkLayout;
  if (!allowed) throw new Error(`NLE Item ${item} does not allow spatial edit ${edit.kind}.`);
}
