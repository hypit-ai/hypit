import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { readonlyInteraction, temporalLineageFor } from "@hypit/studio-adapter";
import { frameParameters } from "./geometry.js";

type RankingSchedule = {
  readonly variant?: string;
  readonly outer?: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly terminalFrame?: number;
  readonly entries?: readonly ({ readonly itemId: string; readonly mode: "preset"; readonly settled: Span } | {
    readonly itemId: string;
    readonly mode: "reveal";
    readonly preferred: Span;
    readonly active: Span;
    readonly settled: Span;
  } | {
    readonly itemId: string;
    readonly triggerFrame: number;
    readonly stage: Span;
    readonly cumulative: Span;
    readonly settled: Span;
  })[];
};

type Span = { readonly startFrame: number; readonly endFrameExclusive: number };

type RankingVisualElement = {
  readonly kind?: string;
  readonly artifact?: { readonly digest?: string; readonly mediaType?: string };
};

type RankingVisualTrack = {
  readonly presents?: readonly {
    readonly id: string;
    readonly elements?: readonly RankingVisualElement[];
  }[];
};

function itemPreview(
  context: StudioAdapterContext,
  itemId: string,
): StudioEntityDraft["preview"] | undefined {
  const track = context.track.value as RankingVisualTrack;
  const present = track.presents?.find((candidate) => candidate.id.includes(`:item:${itemId}:`));
  const artifact = present?.elements?.find((element) => element.kind === "image")?.artifact;
  if (artifact?.digest === undefined) return undefined;
  return artifact.mediaType?.startsWith("video/") === true
    ? { kind: "video", url: `/__studio/material/${artifact.digest}` }
    : { kind: "image", url: `/__studio/material/${artifact.digest}` };
}

/** Column entities come from the public resolved Schedule, never renderer id conventions. */
function projectRanking(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const placement = context.placement;
  const scheduleRef = context.track.trace.outputPorts.find((port) => port.name === "schedule")?.ref;
  const schedule = scheduleRef === undefined ? undefined : context.values.get(scheduleRef) as RankingSchedule | undefined;
  if (placement === undefined || schedule?.outer === undefined) return context.generic();
  const boardId = placement.id ?? context.track.outputRef;
  const parent = `${context.track.outputRef}:entity:${boardId}`;
  const outerTemporal = temporalLineageFor(context, boardId, "outer");
  const outerMarkerId = outerTemporal?.source.id;
  const group: StudioEntityDraft = {
    id: parent,
    authoredId: boardId,
    ...(outerMarkerId === undefined ? {} : { markerId: outerMarkerId }),
    label: boardId,
    startFrame: schedule.outer.startFrame,
    endFrameExclusive: schedule.outer.endFrameExclusive,
    stackOrder: Math.max(...context.spans.map((span) => span.stackOrder), 0),
    elementRange: placement.range,
    renderIds: context.spans.map((span) => span.id),
    presentation: { entity: "ranking", shape: "group", depth: 0 },
    ...(outerTemporal === undefined ? {} : { temporal: outerTemporal }),
    interaction: readonlyInteraction,
  };
  const children = new Map(placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  const reveals = (schedule.entries ?? []).flatMap((entry): readonly StudioEntityDraft[] => {
    if ("mode" in entry && entry.mode !== "reveal") return [];
    const child = children.get(entry.itemId);
    const temporal = temporalLineageFor(context, entry.itemId, "mode" in entry ? "window" : "activation");
    const markerId = temporal?.source.id;
    const preview = itemPreview(context, entry.itemId);
    const visible = "mode" in entry ? entry.active : entry.cumulative;
    return [{
      id: `${context.track.outputRef}:entity:${entry.itemId}`,
      authoredId: entry.itemId,
      ...(markerId === undefined ? {} : { markerId }),
      label: child?.attributes.label ?? entry.itemId,
      startFrame: visible.startFrame,
      endFrameExclusive: visible.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(preview === undefined ? {} : { preview }),
      lane: "mode" in entry ? "reveal" : "activation",
      presentation: { entity: "ranking-reveal", shape: "picture", depth: 0 },
      ...(temporal === undefined ? {} : { temporal }),
      interaction: readonlyInteraction,
    }];
  }).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  return [group, ...reveals];
}

export const rankingAdapters: readonly StudioAdapter[] = [
  { id: "ranking-schedule", role: "realization", output: { type: "RankingSchedule", modules: ["@hypit/ranking"] } },
  {
    id: "ranking-column", role: "track",
    output: { type: "VisualTrack", surface: "column", modules: ["@hypit/ranking"] },
    family: "component", label: "Ranking", icon: "ranking", realizationPorts: ["schedule"],
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "semantic", label: "Semantic", writable: false },
      { name: "canvas", label: "Canvas", writable: false },
      { name: "style", label: "Style", writable: false },
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "frame", label: "Frame", writable: false, referenced: frameParameters },
      { name: "appear-sound", label: "Appear sound", writable: false },
      { name: "move-sound", label: "Move sound", writable: false },
      { name: "label", label: "Label", writable: true },
      { name: "rank", label: "Rank", control: "number", writable: true },
      { name: "preset", label: "Preset", control: "boolean", writable: true },
      { name: "icon", label: "Icon", writable: false },
      { name: "stack", label: "Stack", control: "number", writable: true },
    ],
    poster: { source: "surface-preview" },
    lane: {
      layout: "flat",
      height: { minPx: 64, preferredPx: 80, maxPx: 112 },
      groupId: "ranking-reveals",
    },
    attachments: [{
      id: "reveal",
      family: "ranking-reveal",
      label: "Reveals",
      icon: "ranking",
      facet: "visual",
      lane: {
        layout: "flat",
        height: { minPx: 34, preferredPx: 40, maxPx: 56 },
      },
      parameters: [
        { name: "during", label: "During", writable: false },
      ],
    }],
    interaction: readonlyInteraction, project: projectRanking,
  },
  ...([[
    "ranking-tier", "tier", "Tier Board",
  ], [
    "ranking-top-three", "top-three", "Top Three",
  ]] as const).map(([id, surface, label]): StudioAdapter => ({
    id, role: "track",
    output: { type: "VisualTrack", surface, modules: ["@hypit/ranking"] },
    family: "component", label, icon: "ranking", realizationPorts: ["schedule"],
    parameters: [
      { name: "semantic", label: "Semantic", writable: false },
      { name: "style", label: "Style", writable: false },
      { name: "during", label: "During", writable: false },
      { name: "terminal", label: "Terminal", writable: false },
      { name: "at", label: "At", writable: false },
      { name: "frame", label: "Frame", writable: false, referenced: frameParameters },
      { name: "label", label: "Label", writable: true },
      { name: "icon", label: "Icon", writable: false },
    ],
    poster: { source: "surface-preview" },
    lane: { layout: "flat", height: { minPx: 64, preferredPx: 80, maxPx: 112 }, groupId: `${id}-activations` },
    attachments: [{
      id: "activation", family: "ranking-reveal", label: "Activations", icon: "ranking", facet: "visual",
      lane: { layout: "flat", height: { minPx: 34, preferredPx: 40, maxPx: 56 } },
      parameters: [{ name: "at", label: "At", writable: false }],
    }],
    interaction: readonlyInteraction,
    project: projectRanking,
  })),
];
