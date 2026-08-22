import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { readonlyInteraction, sameSurfaceValue } from "@hypit/studio-adapter";
import { videoLaneHeights } from "./presentation.js";

type DepthStackProgram = {
  readonly terminalFrame: number;
  readonly cards?: readonly { readonly id: string; readonly activationFrame: number }[];
  readonly spec?: { readonly stackingOrder?: number };
};

function projectDeck(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as DepthStackProgram | undefined;
  if (program?.cards === undefined || context.placement === undefined) return context.generic();
  const cards = program.cards;
  const children = new Map(context.placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  return cards.map((card, index): StudioEntityDraft => {
    const child = children.get(card.id);
    const markerId = child?.referenceAttributes.at?.split(".").at(-1)
      ?? child?.referenceAttributes.moment?.split(".").at(-1);
    const endFrameExclusive = cards[index + 1]?.activationFrame ?? program.terminalFrame;
    const render = context.spans.find((span) => span.id === card.id
      || span.id.startsWith(`${card.id}:`) || span.id.startsWith(`${card.id}#`));
    return {
      id: `${context.track.outputRef}:entity:${card.id}`,
      authoredId: card.id,
      ...(markerId === undefined ? {} : { markerId }),
      label: card.id.replace(/^card-/u, ""),
      startFrame: card.activationFrame,
      endFrameExclusive,
      stackOrder: program.spec?.stackingOrder ?? render?.stackOrder ?? 0,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(render === undefined ? {} : { presentId: render.id, renderIds: [render.id] }),
      presentation: { entity: "deck-card", shape: "picture", depth: 0 },
      temporal: {
        source: { kind: "moment", ...(markerId === undefined ? {} : { id: markerId }) },
        projection: {
          startExpression: "moment.cue",
          endExpression: "next moment / terminal",
          startFrame: card.activationFrame,
          endFrameExclusive,
        },
        phases: [],
      },
      interaction: readonlyInteraction,
    };
  });
}

export const deckAdapters: readonly StudioAdapter[] = [
  { id: "deck-program", role: "realization", output: { type: "DepthStackProgram", modules: ["@hypit/deck-track"] } },
  {
    id: "deck", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/deck-track"] },
    family: "component", icon: "layers", realizationPorts: ["program"],
    interaction: readonlyInteraction, project: projectDeck,
    lane: { layout: "flat", height: videoLaneHeights.component },
  },
];
