import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { readonlyInteraction } from "@hypit/studio-adapter";

type RankingSchedule = {
  readonly variant?: string;
  readonly outer?: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly entries?: readonly ({ readonly itemId: string; readonly mode: "preset"; readonly settled: Span } | {
    readonly itemId: string;
    readonly mode: "reveal";
    readonly preferred: Span;
    readonly active: Span;
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
  if (placement === undefined || schedule?.outer === undefined || schedule.variant !== "column") return context.generic();
  const boardId = placement.id ?? context.track.outputRef;
  const parent = `${context.track.outputRef}:entity:${boardId}`;
  const outerMarkerId = placement.referenceAttributes.during?.split(".").at(-1);
  const outerSourceType = placement.referenceTypes.during;
  const outerSourceKind = outerSourceType === "NarrativeExcerpt" ? "segment" as const : "selection" as const;
  const outerStartExpression = outerSourceKind === "segment" ? "segment.start" : "selection.start";
  const outerEndExpression = outerSourceKind === "segment" ? "segment.end" : "selection.end";
  const group: StudioEntityDraft = {
    id: parent,
    authoredId: boardId,
    label: boardId,
    startFrame: schedule.outer.startFrame,
    endFrameExclusive: schedule.outer.endFrameExclusive,
    stackOrder: Math.max(...context.spans.map((span) => span.stackOrder), 0),
    elementRange: placement.range,
    renderIds: context.spans.map((span) => span.id),
    presentation: { entity: "ranking", shape: "group", depth: 0 },
    temporal: {
      source: { kind: outerSourceKind, ...(outerMarkerId === undefined ? {} : { id: outerMarkerId }) },
      projection: {
        startExpression: outerStartExpression,
        endExpression: outerEndExpression,
        ...schedule.outer,
      },
      phases: [],
    },
    interaction: readonlyInteraction,
  };
  const children = new Map(placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  const reveals = (schedule.entries ?? []).flatMap((entry): readonly StudioEntityDraft[] => {
    if (entry.mode !== "reveal") return [];
    const child = children.get(entry.itemId);
    const markerId = child?.referenceAttributes.during?.split(".").at(-1);
    const preview = itemPreview(context, entry.itemId);
    return [{
      id: `${context.track.outputRef}:entity:${entry.itemId}`,
      authoredId: entry.itemId,
      ...(markerId === undefined ? {} : { markerId }),
      label: child?.attributes.label ?? entry.itemId,
      startFrame: entry.active.startFrame,
      endFrameExclusive: entry.active.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(preview === undefined ? {} : { preview }),
      lane: "reveal",
      presentation: { entity: "ranking-reveal", shape: "picture", depth: 0 },
      temporal: {
        source: { kind: "selection", ...(markerId === undefined ? {} : { id: markerId }) },
        projection: {
          startExpression: "selection.start",
          endExpression: "selection.end",
          ...entry.preferred,
        },
        phases: [],
      },
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
        expandedByDefault: true,
      },
    }],
    interaction: readonlyInteraction, project: projectRanking,
  },
];
