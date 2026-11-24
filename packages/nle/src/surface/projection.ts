import { findNleComposition, isNlePicturePresent } from "../project.js";
import { nleDirectTransitionCuts } from "../transition-cut.js";
import { nleTrackStackingNeighbors } from "./stacking.js";
import type { NleEditingContext } from "./types.js";
import { exactTemporalRational, type ExactTemporalValue, type TemporalRate } from "@hypit/temporal/algebra";
import type { NleItem, NleProcessControlTime, NleProject, NleTrack } from "../types.js";
import type {
  NleEdgeProcessTiming,
  NleTimelineAffordancePolicy,
  NleTimelineItemObservation,
  NleTimelineItemCapabilities,
  NleTimelineScene,
  NleTimelineSceneItem,
} from "./projection-types.js";

function frames(value: ExactTemporalValue, rate: TemporalRate): number {
  const exact = exactTemporalRational(value);
  const result = Number(exact.numerator) / Number(exact.denominator)
    * rate.numerator / rate.denominator;
  if (!Number.isFinite(result)) throw new Error("NLE Timeline frame projection exceeds finite UI coordinates.");
  return result;
}

export function projectNleProcessEdge(time: NleProcessControlTime, rate: TemporalRate): NleEdgeProcessTiming | undefined {
  if ("edge" in time) return { edge: time.edge, durationFrames: frames(time.duration, rate) };
}

function source(item: NleItem): NleTimelineSceneItem["source"] {
  return item.kind === "adjust" ? "adjust" : item.source;
}

function defaultTitle(project: NleProject, item: NleItem): string {
  if (item.name !== undefined) return item.name;
  if (item.kind === "adjust") return item.operator.symbol;
  if (item.source === "media") {
    const part = item.asset.path.split("/").at(-1) ?? item.asset.path;
    return part.replace(/\.media\.json$/u, "");
  }
  if (item.source === "component") return item.component.symbol;
  return project.compositions.find((composition) => composition.id === item.composition)?.name
    ?? item.composition;
}

function assertObservation(observation: NleTimelineItemObservation): void {
  if (observation === null || typeof observation !== "object" || typeof observation.item !== "string"
    || Object.keys(observation).some(key => key !== "item" && key !== "title" && key !== "text" && key !== "picture")) {
    throw new Error("NLE Timeline observation is invalid.");
  }
  if (observation.title !== undefined
    && (typeof observation.title !== "string" || observation.title.trim().length === 0)) {
    throw new Error(`NLE Timeline observation ${observation.item} title is invalid.`);
  }
  if (observation.text !== undefined && typeof observation.text !== "string") {
    throw new Error(`NLE Timeline observation ${observation.item} text is invalid.`);
  }
  if (observation.picture !== undefined && (!Number.isFinite(observation.picture.sourceExtent.width)
    || observation.picture.sourceExtent.width <= 0
    || !Number.isFinite(observation.picture.sourceExtent.height)
    || observation.picture.sourceExtent.height <= 0)) {
    throw new Error(`NLE Timeline observation ${observation.item} Picture extent is invalid.`);
  }
}

/** Compose orthogonal package and Host observations for the same exact Item. */
export function mergeNleTimelineItemObservations(
  observations: readonly NleTimelineItemObservation[],
): readonly NleTimelineItemObservation[] {
  const merged = new Map<string, NleTimelineItemObservation>();
  for (const observation of observations) {
    assertObservation(observation);
    const current = merged.get(observation.item);
    if (current === undefined) {
      merged.set(observation.item, structuredClone(observation));
      continue;
    }
    if (current.title !== undefined && observation.title !== undefined
      && current.title !== observation.title) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} title.`);
    }
    if (current.text !== undefined && observation.text !== undefined && current.text !== observation.text) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} text.`);
    }
    if (current.picture !== undefined && observation.picture !== undefined
      && (current.picture.sourceExtent.width !== observation.picture.sourceExtent.width
        || current.picture.sourceExtent.height !== observation.picture.sourceExtent.height)) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} Picture extent.`);
    }
    merged.set(observation.item, {
      item: observation.item,
      ...(current.title === undefined && observation.title === undefined
        ? {} : { title: current.title ?? observation.title }),
      ...(current.text === undefined && observation.text === undefined
        ? {} : { text: current.text ?? observation.text }),
      ...(current.picture === undefined && observation.picture === undefined
        ? {} : { picture: current.picture ?? observation.picture }),
    });
  }
  return [...merged.values()];
}

/** Project tracks are ordered from bottom to top. The editor lists them from top to bottom. */
export function orderNleTimelineTracks(tracks: readonly NleTrack[]): readonly NleTrack[] {
  return [...tracks].reverse();
}

/** Join the active Composition, session state and finite invocation-local observations. */
export function projectNleTimeline(
  project: NleProject,
  editing: NleEditingContext,
  observations: readonly NleTimelineItemObservation[] = [],
  capabilities: readonly NleTimelineItemCapabilities[] = [],
  policy: NleTimelineAffordancePolicy = {
    move: false, trimStart: false, trimEnd: false, split: false,
  },
): NleTimelineScene {
  const composition = findNleComposition(project, editing.activeComposition);
  const itemIds = new Set(composition.tracks.flatMap((track) => track.items.map((item) => item.id)));
  const byItem = new Map<string, NleTimelineItemObservation>();
  for (const observation of mergeNleTimelineItemObservations(observations)) {
    if (!itemIds.has(observation.item)) {
      throw new Error(
        `NLE Timeline observation references Item ${observation.item} outside active Composition ${composition.id}.`,
      );
    }
    byItem.set(observation.item, observation);
  }
  const groupByItem = new Map<string, string>();
  for (const group of composition.groups) {
    for (const item of group.items) groupByItem.set(item, group.id);
  }
  const capabilitiesByItem = new Map<string, NleTimelineItemCapabilities>();
  for (const capability of capabilities) {
    if (!itemIds.has(capability.item)) {
      throw new Error(
        `NLE Timeline capability references Item ${capability.item} outside active Composition ${composition.id}.`,
      );
    }
    if (capabilitiesByItem.has(capability.item)) {
      throw new Error(`NLE Timeline capabilities repeat Item ${capability.item}.`);
    }
    capabilitiesByItem.set(capability.item, capability);
  }

  let maximumFrame = 1;
  const timelineTracks = orderNleTimelineTracks(composition.tracks);
  const transitionItems = new Set(composition.transitions.flatMap(({ outgoing, incoming }) => [outgoing, incoming]));
  const tracks = timelineTracks.map((track) => {
    const locked = editing.lockedTracks.has(track.id);
    const stacking = locked ? undefined : nleTrackStackingNeighbors(track, transitionItems);
    const items = track.items.map((item): NleTimelineSceneItem => {
      const startFrame = frames(item.start, project.editRate);
      const durationFrames = frames(item.duration, project.editRate);
      maximumFrame = Math.max(maximumFrame, startFrame + durationFrames);
      const observation = byItem.get(item.id);
      const group = groupByItem.get(item.id);
      const capability = capabilitiesByItem.get(item.id);
      const neighbors = stacking?.get(item.id);
      return {
        id: item.id,
        track: track.id,
        kind: item.kind,
        source: source(item),
        signals: {
          picture: isNlePicturePresent(item),
          audio: item.kind === "present" && item.audio !== undefined,
        },
        ...(item.kind === "present" && item.source === "composition"
          ? { nestedComposition: item.composition }
          : {}),
        enabled: item.enabled,
        startFrame,
        durationFrames,
        anchoredProcesses: item.kind !== "present" ? [] : (["picture", "audio"] as const).flatMap(medium =>
          (item[medium]?.processes ?? []).flatMap(process => {
            const timing = process.enabled ? projectNleProcessEdge(process.controlTime, project.editRate) : undefined;
            return timing === undefined ? [] : [{ ...timing, medium, id: process.id, label: process.operator.symbol }];
          })),
        ...(group === undefined ? {} : { group }),
        ...(neighbors === undefined ? {} : { stacking: neighbors }),
        display: {
          title: item.name ?? observation?.title ?? defaultTitle(project, item),
          ...(observation?.text === undefined ? {} : { text: observation.text }),
        },
        affordances: {
          select: true,
          move: capability?.move === true && policy.move,
          trimStart: capability?.trimStart === true && policy.trimStart,
          trimEnd: capability?.trimEnd === true && policy.trimEnd,
          split: capability?.split === true && policy.split,
        },
      };
    });
    return {
      id: track.id,
      name: track.name,
      kind: track.kind,
      role: track.role,
      pictureEnabled: track.pictureEnabled,
      audioEnabled: track.audioEnabled,
      locked,
      items,
    };
  });
  return {
    composition: composition.id,
    editRate: structuredClone(project.editRate),
    groups: structuredClone(composition.groups),
    transitions: composition.transitions.map((value) => ({
      id: value.id,
      outgoing: value.outgoing,
      incoming: value.incoming,
      operator: structuredClone(value.operator),
    })),
    transitionCuts: timelineTracks.flatMap(track => editing.lockedTracks.has(track.id) ? []
      : nleDirectTransitionCuts(composition, track).map(({ at, outgoing, incoming }) => ({
        frame: frames(at, project.editRate), track: track.id, outgoing, incoming,
      }))),
    mattes: composition.mattes.map((value) => ({
      id: value.id,
      content: value.content,
      matte: value.matte,
    })),
    tracks,
    maximumFrame,
  };
}
