import { exactTemporalRational, type ExactTemporalValue, type TemporalRate } from "@hypit/temporal/algebra";
import type { NleItem, NleProcessControlTime, NleProject, NleTrack } from "../types.js";
import type {
  NleEdgeProcessTiming,
  NleTimelineDisplayLayer,
  NleTimelineAffordancePolicy,
  NleTimelineItemObservation,
  NleTimelineItemCapabilities,
  NleTimelineScene,
  NleTimelineSceneItem,
  NleTimelineTone,
  NleView,
} from "./types.js";
import { assertNleViewForProject } from "./view.js";

const tones = new Set<NleTimelineTone>([
  "blue", "blue-muted", "green", "green-muted", "violet", "magenta", "orange", "neutral",
]);
const chromes = new Set(["standard", "group", "compact"]);
const layouts = new Set(["filmstrip", "repeat-x", "cover", "contain", "waveform"]);
const mediaKinds = new Set(["image", "video", "audio"]);

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

function defaultTone(item: NleItem, track: NleTrack): NleTimelineTone {
  if (track.kind === "audio") return item.kind === "adjust" ? "orange" : "green";
  if (item.kind === "adjust") return "violet";
  if (item.source === "component") return "magenta";
  if (item.source === "composition") return "green-muted";
  return "blue";
}

function defaultChrome(item: NleItem): NleTimelineSceneItem["presentation"]["chrome"] {
  if (item.kind === "adjust") return "compact";
  return item.source === "composition" ? "group" : "standard";
}

function assertLayer(layer: NleTimelineDisplayLayer, item: string): void {
  if (layer === null || typeof layer !== "object") {
    throw new Error(`NLE Timeline observation ${item} contains an invalid layer.`);
  }
  if (layer.kind === "text") {
    if (typeof layer.text !== "string") {
      throw new Error(`NLE Timeline observation ${item} contains invalid text.`);
    }
    return;
  }
  if (layer.kind !== "preview" || !mediaKinds.has(layer.media) || !layouts.has(layer.layout)
    || (layer.state !== "pending" && layer.state !== "unavailable" && layer.state !== "ready")) {
    throw new Error(`NLE Timeline observation ${item} contains an invalid preview layer.`);
  }
  if (layer.state === "ready" && (typeof layer.resource !== "string" || layer.resource.length === 0)) {
    throw new Error(`NLE Timeline observation ${item} ready preview has no resource.`);
  }
  if (layer.state !== "ready" && Object.hasOwn(layer, "resource")) {
    throw new Error(`NLE Timeline observation ${item} pending preview cannot own a resource.`);
  }
}

function assertObservation(observation: NleTimelineItemObservation): void {
  if (observation === null || typeof observation !== "object" || typeof observation.item !== "string") {
    throw new Error("NLE Timeline observation is invalid.");
  }
  if (observation.title !== undefined
    && (typeof observation.title !== "string" || observation.title.trim().length === 0)) {
    throw new Error(`NLE Timeline observation ${observation.item} title is invalid.`);
  }
  if (observation.layers !== undefined) {
    if (!Array.isArray(observation.layers)) {
      throw new Error(`NLE Timeline observation ${observation.item} layers are invalid.`);
    }
    for (const layer of observation.layers) assertLayer(layer, observation.item);
  }
  if (observation.picture !== undefined && (!Number.isFinite(observation.picture.sourceExtent.width)
    || observation.picture.sourceExtent.width <= 0
    || !Number.isFinite(observation.picture.sourceExtent.height)
    || observation.picture.sourceExtent.height <= 0)) {
    throw new Error(`NLE Timeline observation ${observation.item} Picture extent is invalid.`);
  }
  const presentation = observation.presentation;
  if (presentation !== undefined && (!tones.has(presentation.tone) || !chromes.has(presentation.chrome))) {
    throw new Error(`NLE Timeline observation ${observation.item} presentation is invalid.`);
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
    if (current.presentation !== undefined && observation.presentation !== undefined
      && JSON.stringify(current.presentation) !== JSON.stringify(observation.presentation)) {
      throw new Error(`NLE Timeline observations conflict on Item ${observation.item} presentation.`);
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
      layers: [...(current.layers ?? []), ...(observation.layers ?? [])],
      ...(current.presentation === undefined && observation.presentation === undefined
        ? {} : { presentation: current.presentation ?? observation.presentation }),
      ...(current.picture === undefined && observation.picture === undefined
        ? {} : { picture: current.picture ?? observation.picture }),
    });
  }
  return [...merged.values()];
}

/** Join the active Composition, durable View choices and finite invocation-local observations. */
export function projectNleTimeline(
  project: NleProject,
  view: NleView,
  observations: readonly NleTimelineItemObservation[] = [],
  capabilities: readonly NleTimelineItemCapabilities[] = [],
  policy: NleTimelineAffordancePolicy = {
    move: false, trimStart: false, trimEnd: false, split: false,
  },
): NleTimelineScene {
  assertNleViewForProject(view, project);
  const composition = project.compositions.find((candidate) => candidate.id === view.activeComposition)!;
  const state = view.compositions.find((candidate) => candidate.composition === composition.id);
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
  for (const group of state?.groups ?? []) {
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
  const timelineTracks = [
    ...composition.tracks.filter(track => track.kind === "picture").reverse(),
    ...composition.tracks.filter(track => track.kind === "audio"),
  ];
  const tracks = timelineTracks.map((track) => {
    const trackState = state?.tracks.find((candidate) => candidate.track === track.id);
    const items = track.items.map((item): NleTimelineSceneItem => {
      const startFrame = frames(item.start, view.editRate);
      const durationFrames = frames(item.duration, view.editRate);
      maximumFrame = Math.max(maximumFrame, startFrame + durationFrames);
      const observation = byItem.get(item.id);
      const group = groupByItem.get(item.id);
      const capability = capabilitiesByItem.get(item.id);
      return {
        id: item.id,
        track: track.id,
        role: item.kind,
        source: source(item),
        signals: {
          picture: item.kind === "present" && item.picture !== undefined,
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
            const timing = process.enabled ? projectNleProcessEdge(process.controlTime, view.editRate) : undefined;
            return timing === undefined ? [] : [{ ...timing, medium, id: process.id, label: process.operator.symbol }];
          })),
        ...(group === undefined ? {} : { group }),
        display: {
          title: item.name ?? observation?.title ?? defaultTitle(project, item),
          layers: structuredClone(observation?.layers ?? []),
        },
        presentation: {
          tone: observation?.presentation?.tone ?? defaultTone(item, track),
          chrome: observation?.presentation?.chrome ?? defaultChrome(item),
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
      ...(track.role === undefined ? {} : { role: track.role }),
      enabled: track.enabled,
      locked: trackState?.locked ?? false,
      heightPx: trackState?.heightPx ?? (track.role === undefined ? 62 : 36),
      tone: track.kind === "picture" ? "blue" as const : "green" as const,
      items,
    };
  });
  return {
    composition: composition.id,
    editRate: structuredClone(view.editRate),
    groups: structuredClone(state?.groups ?? []),
    transitions: composition.transitions.map((value) => ({
      id: value.id,
      outgoing: value.outgoing,
      incoming: value.incoming,
      operator: structuredClone(value.operator),
    })),
    mattes: composition.mattes.map((value) => ({
      id: value.id,
      content: value.content,
      matte: value.matte,
    })),
    tracks,
    maximumFrame,
  };
}
