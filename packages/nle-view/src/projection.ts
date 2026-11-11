import { findNlePictureLayout, resolveNlePictureLayout } from "@hypit/nle";
import type { NleItem, NleProject, NleTrack } from "@hypit/nle";
import type { ExactTemporalValue, TemporalRate } from "@hypit/temporal/algebra";

import type {
  NleTimelineItemObservation,
  NleCanvasScene,
  NleCanvasSceneLayer,
  NleTimelineScene,
  NleTimelineSceneItem,
  NleTimelineTone,
  NleTimelineView,
} from "./types.js";
import { assertNleTimelineViewForProject } from "./view.js";

function frames(value: ExactTemporalValue, rate: TemporalRate): number {
  return Number(BigInt(value.ticks))
    * value.timeBase.numerator / value.timeBase.denominator
    * rate.numerator / rate.denominator;
}

function source(item: NleItem): NleTimelineSceneItem["source"] {
  return item.kind === "adjustment" ? "adjustment" : item.source;
}

function observationsByItem(
  project: NleProject,
  observations: readonly NleTimelineItemObservation[],
): ReadonlyMap<string, NleTimelineItemObservation> {
  const projectItems = new Set(project.tracks.flatMap((track) => track.items.map((item) => item.id)));
  const result = new Map<string, NleTimelineItemObservation>();
  for (const observation of observations) {
    if (!projectItems.has(observation.item)) {
      throw new Error(`NLE Timeline observation references missing Item ${observation.item}.`);
    }
    if (result.has(observation.item)) {
      throw new Error(`NLE Timeline observations repeat Item ${observation.item}.`);
    }
    result.set(observation.item, observation);
  }
  return result;
}

function title(item: NleItem): string {
  if (item.name !== undefined) return item.name;
  if (item.kind === "adjustment") return item.component.name;
  if (item.source === "media") {
    const parts = item.asset.path.split("/");
    return parts[parts.length - 1]!.replace(/\.media\.json$/u, "");
  }
  if (item.source === "component") return item.component.name;
  return item.composition.name;
}

function tone(item: NleItem, track: NleTrack): NleTimelineTone {
  if (track.kind === "audio") return item.kind === "adjustment" ? "orange" : "green";
  if (item.kind === "adjustment") return "violet";
  if (item.source === "component") return "magenta";
  if (item.source === "composition") return "green-muted";
  return "blue";
}

function chrome(item: NleItem): NleTimelineSceneItem["presentation"]["chrome"] {
  if (item.kind === "adjustment") return "compact";
  return item.source === "composition" ? "group" : "standard";
}

/** Compose orthogonal package facts and Host preview layers for the same exact Item. */
export function mergeNleTimelineItemObservations(
  observations: readonly NleTimelineItemObservation[],
): readonly NleTimelineItemObservation[] {
  const merged = new Map<string, NleTimelineItemObservation>();
  for (const observation of observations) {
    const current = merged.get(observation.item);
    if (current === undefined) {
      merged.set(observation.item, structuredClone(observation));
      continue;
    }
    if (current.title !== undefined && observation.title !== undefined
      && current.title !== observation.title) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} title.`);
    }
    if (current.presentation !== undefined && observation.presentation !== undefined
      && (current.presentation.tone !== observation.presentation.tone
        || current.presentation.chrome !== observation.presentation.chrome
        || current.presentation.heightPx !== observation.presentation.heightPx)) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} presentation.`);
    }
    merged.set(observation.item, {
      item: observation.item,
      ...(current.title === undefined && observation.title === undefined
        ? {}
        : { title: current.title ?? observation.title }),
      layers: [...(current.layers ?? []), ...(observation.layers ?? [])],
      ...(current.presentation === undefined && observation.presentation === undefined
        ? {}
        : { presentation: current.presentation ?? observation.presentation }),
    });
  }
  return [...merged.values()];
}

/** Join durable NLE facts with invocation-local presentation observations. */
export function projectNleTimeline(
  project: NleProject,
  view: NleTimelineView,
  observations: readonly NleTimelineItemObservation[] = [],
): NleTimelineScene {
  assertNleTimelineViewForProject(view, project);
  const itemObservations = observationsByItem(project, observations);

  let maximumFrame = 1;
  // NLE composition stores Picture Tracks back-to-front. Timeline convention presents the
  // foreground at the top, while Audio Tracks remain in their authored order below Picture.
  const timelineTracks = [
    ...project.tracks.filter((track) => track.kind === "picture").reverse(),
    ...project.tracks.filter((track) => track.kind === "audio"),
  ];
  const tracks = timelineTracks.map((track) => {
    const trackState = view.tracks.find((state) => state.track === track.id);
    const locked = trackState?.locked ?? false;
    const items = track.items.map((item): NleTimelineSceneItem => {
      const startFrame = frames(item.start, view.editRate);
      const durationFrames = frames(item.duration, view.editRate);
      const mediaTimeEditing = !locked && item.kind === "present" && item.source === "media";
      maximumFrame = Math.max(maximumFrame, startFrame + durationFrames);
      const observation = itemObservations.get(item.id);
      return {
        id: item.id,
        track: track.id,
        role: item.kind,
        source: source(item),
        enabled: item.enabled,
        startFrame,
        durationFrames,
        display: {
          title: item.name ?? observation?.title ?? title(item),
          layers: structuredClone(observation?.layers ?? []),
        },
        presentation: observation?.presentation ?? { tone: tone(item, track), chrome: chrome(item) },
        editing: {
          move: !locked,
          trimStart: mediaTimeEditing,
          trimEnd: mediaTimeEditing,
          split: mediaTimeEditing,
        },
      };
    });
    const defaultHeight = items.length === 0 ? track.kind === "audio" ? 48 : 52 : Math.max(...items.map((item) =>
      item.presentation.heightPx
      ?? (track.kind === "audio" ? 48
        : item.role === "adjustment" ? 32
        : item.source === "media" ? 76
        : 52)));
    return {
      id: track.id,
      name: track.name,
      kind: track.kind,
      muted: track.muted,
      locked,
      heightPx: trackState?.heightPx ?? defaultHeight,
      tone: track.kind === "picture" ? "blue" as const : "green" as const,
      items,
    };
  });
  return { tracks, maximumFrame };
}

/** Project Item-level Picture contributions without inspecting Component-internal visual trees. */
export function projectNleCanvas(
  project: NleProject,
  view: NleTimelineView,
  observations: readonly NleTimelineItemObservation[] = [],
): NleCanvasScene {
  assertNleTimelineViewForProject(view, project);
  const itemObservations = observationsByItem(project, observations);
  const layoutUsers = new Map(project.pictureLayouts.map((layout) => [layout.id,
    project.tracks.flatMap((track) => track.items.flatMap((item) =>
      item.kind === "present" && item.picture !== undefined && "ref" in item.picture.layout
        && item.picture.layout.ref === layout.id ? [item.id] : [])),
  ] as const));
  const layers: NleCanvasSceneLayer[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "picture") continue;
    const locked = view.tracks.find((state) => state.track === track.id)?.locked ?? false;
    for (const item of track.items) {
      const observation = itemObservations.get(item.id);
      const common = {
        id: item.id,
        track: track.id,
        title: item.name ?? observation?.title ?? title(item),
        role: item.kind,
        source: source(item),
        enabled: item.enabled,
        trackMuted: track.muted,
        startFrame: frames(item.start, view.editRate),
        durationFrames: frames(item.duration, view.editRate),
      } as const;
      if (item.kind === "adjustment") {
        layers.push({ ...common, owner: { kind: "item" }, editing: { select: true, transform: false } });
        continue;
      }
      if (item.picture === undefined) continue;
      const layoutSource = item.picture.layout;
      const owner: NleCanvasSceneLayer["owner"] = "ref" in layoutSource ? (() => {
        const resource = findNlePictureLayout(project, layoutSource.ref);
        return {
          kind: "picture-layout" as const,
          ref: resource.id,
          name: resource.name,
          sharedBy: structuredClone(layoutUsers.get(resource.id) ?? []),
        };
      })() : { kind: "item" };
      layers.push({
        ...common,
        layout: resolveNlePictureLayout(project, layoutSource),
        owner,
        editing: { select: true, transform: !locked },
      });
    }
  }
  return { canvas: structuredClone(project.canvas), layers };
}
