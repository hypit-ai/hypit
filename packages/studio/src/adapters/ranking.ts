import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { readonlyInteraction } from "./types.js";

type RankingSchedule = {
  readonly variant?: string;
  readonly outer?: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly entries?: readonly ({ readonly itemId: string; readonly mode: "preset" } | {
    readonly itemId: string;
    readonly mode: "reveal";
    readonly active: { readonly startFrame: number; readonly endFrameExclusive: number };
  })[];
};

/** Column entities come from the public resolved Schedule, never renderer id conventions. */
function projectRanking(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const placement = context.placement;
  const scheduleRef = context.track.trace.outputPorts.find((port) => port.name === "schedule")?.ref;
  const schedule = scheduleRef === undefined ? undefined : context.values.get(scheduleRef) as RankingSchedule | undefined;
  if (placement === undefined || schedule?.outer === undefined || schedule.variant !== "column") return context.generic();
  const boardId = placement.id ?? context.track.outputRef;
  const parent = `${context.track.outputRef}:entity:${boardId}`;
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
    interaction: readonlyInteraction,
  };
  const children = new Map(placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  const reveals = (schedule.entries ?? []).flatMap((entry): StudioEntityDraft[] => {
    if (entry.mode !== "reveal") return [];
    const child = children.get(entry.itemId);
    const markerId = child?.referenceAttributes.during?.split(".").at(-1);
    return [{
      id: `${context.track.outputRef}:entity:${entry.itemId}:reveal`,
      authoredId: entry.itemId,
      ...(markerId === undefined ? {} : { markerId }),
      label: child?.attributes.label ?? entry.itemId,
      startFrame: entry.active.startFrame,
      endFrameExclusive: entry.active.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      presentation: { entity: "ranking-reveal", shape: "window", parentId: parent, depth: 1 },
      interaction: readonlyInteraction,
    }];
  });
  return [group, ...reveals];
}

export const rankingAdapters: readonly StudioAdapter[] = [
  { id: "ranking-schedule", role: "realization", output: { type: "RankingSchedule", modules: ["@hypit/ranking"] } },
  {
    id: "ranking-column", role: "track",
    output: { type: "VisualTrack", surface: "column", modules: ["@hypit/ranking"] },
    family: "component", icon: "leaderboard", realizationPorts: ["schedule"],
    lane: { layout: "nested", boundFacets: false },
    interaction: readonlyInteraction, project: projectRanking,
  },
];
