import { findNleComposition } from "../project.js";
import type { NleEditingContext } from "./types.js";
import { fitNlePictureContent } from "../picture.js";
import { indexNleProject } from "../indexing.js";
import { resolveNlePictureLayout } from "../project.js";
import type { NleItem, NleProject } from "../types.js";
import type { NleSpatialEdit } from "../spatial-authoring.js";
import { mergeNleTimelineItemObservations } from "./projection.js";
import type {
  NleCanvasAffordancePolicy,
  NleCanvasScene,
  NleCanvasSceneLayer,
  NleSpatialItemCapabilities,
  NleTimelineItemObservation,
} from "./projection-types.js";

export const allNleCanvasAffordances: NleCanvasAffordancePolicy = {
  translateFrame: true,
  resizeFrame: true,
};

function source(item: NleItem): NleCanvasSceneLayer["source"] {
  return item.kind === "adjust" ? "adjust" : item.source;
}

function title(project: NleProject, item: NleItem): string {
  if (item.name !== undefined) return item.name;
  if (item.kind === "adjust") return item.operator.symbol;
  if (item.source === "media") {
    return (item.asset.path.split("/").at(-1) ?? item.asset.path).replace(/\.media\.json$/u, "");
  }
  if (item.source === "component") return item.component.symbol;
  return project.compositions.find((composition) => composition.id === item.composition)?.name ?? item.composition;
}

export function resolveNleSpatialItemCapabilities(
  project: NleProject,
  editing: NleEditingContext,
): readonly NleSpatialItemCapabilities[] {
  const composition = findNleComposition(project, editing.activeComposition);
  const index = indexNleProject(project);
  return composition.tracks.flatMap((track) => track.items.flatMap((item) => {
    if (item.kind !== "present" || item.picture === undefined) return [];
    const writable = !editing.lockedTracks.has(track.id);
    const sharedUsers = "ref" in item.picture.layout
      ? index.sharedValueUsers(item.picture.layout.ref) : [];
    const sharedWritable = writable && sharedUsers.every((user) =>
      !editing.lockedTracks.has(user.track.id));
    const editsLayout = "ref" in item.picture.layout ? sharedWritable : writable;
    return [{
      item: item.id,
      replaceLayout: editsLayout,
      translateFrame: editsLayout,
      resizeFrame: editsLayout,
      setFit: editsLayout,
      setFocus: editsLayout,
      shareLayout: writable && !("ref" in item.picture.layout),
      linkLayout: writable,
      unlinkLayout: writable && "ref" in item.picture.layout,
    }];
  }));
}

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
              : edit.kind === "layout.link" ? capability.linkLayout
                : capability.unlinkLayout;
  if (!allowed) throw new Error(`NLE Item ${item} does not allow spatial edit ${edit.kind}.`);
}

/** Project only Item-level Picture ownership; package-internal visual trees remain private. */
export function projectNleCanvas(
  project: NleProject,
  editing: NleEditingContext,
  observations: readonly NleTimelineItemObservation[] = [],
  capabilities: readonly NleSpatialItemCapabilities[] = [],
  policy: NleCanvasAffordancePolicy = { translateFrame: false, resizeFrame: false },
): NleCanvasScene {
  const composition = findNleComposition(project, editing.activeComposition);
  const itemIds = new Set(composition.tracks.flatMap((track) => track.items.map((item) => item.id)));
  const byItem = new Map<string, NleTimelineItemObservation>();
  for (const observation of mergeNleTimelineItemObservations(observations)) {
    if (!itemIds.has(observation.item)) {
      throw new Error(
        `NLE Canvas observation references Item ${observation.item} outside active Composition ${composition.id}.`,
      );
    }
    byItem.set(observation.item, observation);
  }
  const byCapability = new Map<string, NleSpatialItemCapabilities>();
  for (const capability of capabilities) {
    if (!itemIds.has(capability.item)) {
      throw new Error(
        `NLE Canvas capability references Item ${capability.item} outside active Composition ${composition.id}.`,
      );
    }
    if (byCapability.has(capability.item)) {
      throw new Error(`NLE Canvas capabilities repeat Item ${capability.item}.`);
    }
    byCapability.set(capability.item, capability);
  }
  const layers: NleCanvasSceneLayer[] = [];
  for (const track of composition.tracks) {
    if (track.kind !== "picture") continue;
    for (const item of track.items) {
      const observation = byItem.get(item.id);
      const common = {
        id: item.id,
        track: track.id,
        title: item.name ?? observation?.title ?? title(project, item),
        role: item.kind,
        source: source(item),
        enabled: item.enabled,
        trackEnabled: track.enabled,
      } as const;
      if (item.kind === "adjust") {
        layers.push({
          ...common,
          affordances: { select: true, translate: false, resize: false },
        });
        continue;
      }
      if (item.picture === undefined) continue;
      const layout = resolveNlePictureLayout(project, item.picture.layout);
      const extent = observation?.picture?.sourceExtent;
      const capability = byCapability.get(item.id);
      layers.push({
        ...common,
        layout,
        ...(extent === undefined ? {} : { content: fitNlePictureContent(layout, extent) }),
        affordances: {
          select: true,
          translate: capability?.translateFrame === true && policy.translateFrame,
          resize: capability?.resizeFrame === true && policy.resizeFrame ? {
            handles: ["nw", "ne", "se", "sw"],
            minimumWidth: 1,
            minimumHeight: 1,
            aspectRatio: layout.width / layout.height,
          } : false,
        },
      });
    }
  }
  return {
    composition: composition.id,
    canvas: structuredClone(composition.canvas),
    layers,
  };
}
