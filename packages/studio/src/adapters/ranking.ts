import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { readonlyInteraction } from "./types.js";

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
  const entries = (schedule.entries ?? []).map((entry): StudioEntityDraft => {
    const child = children.get(entry.itemId);
    const markerId = child?.referenceAttributes.during?.split(".").at(-1);
    const span = entry.mode === "preset"
      ? entry.settled
      : { startFrame: entry.active.startFrame, endFrameExclusive: entry.settled.endFrameExclusive };
    return {
      id: `${context.track.outputRef}:entity:${entry.itemId}`,
      authoredId: entry.itemId,
      ...(markerId === undefined ? {} : { markerId }),
      label: child?.attributes.label ?? entry.itemId,
      startFrame: span.startFrame,
      endFrameExclusive: span.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      presentation: { entity: "ranking-item", shape: "window", parentId: parent, depth: 1 },
      temporal: entry.mode === "preset" ? {
        source: { kind: "parent-schedule" },
        phases: [{ id: `${entry.itemId}:settled`, label: "Settled", role: "settled", ...entry.settled }],
      } : {
        source: { kind: "selection", ...(markerId === undefined ? {} : { id: markerId }) },
        projection: {
          startExpression: "selection.start",
          endExpression: "selection.end",
          ...entry.preferred,
        },
        phases: [
          { id: `${entry.itemId}:active`, label: "Reveal", role: "active", ...entry.active },
          { id: `${entry.itemId}:settled`, label: "Settled", role: "settled", ...entry.settled },
        ],
      },
      interaction: readonlyInteraction,
    };
  });
  return [group, ...entries];
}

export const rankingAdapters: readonly StudioAdapter[] = [
  { id: "ranking-schedule", role: "realization", output: { type: "RankingSchedule", modules: ["@hypit/ranking"] } },
  {
    id: "ranking-column", role: "track",
    output: { type: "VisualTrack", surface: "column", modules: ["@hypit/ranking"] },
    family: "component", icon: "ranking", realizationPorts: ["schedule"],
    lane: { layout: "nested", boundFacets: false },
    interaction: readonlyInteraction, project: projectRanking,
  },
];
