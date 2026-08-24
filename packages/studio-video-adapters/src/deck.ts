import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { readonlyInteraction, sameSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";
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
    const temporal = temporalLineageFor(context, card.id, "activation");
    const markerId = temporal?.source.id;
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
      ...(temporal === undefined ? {} : { temporal }),
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
    timelineGestures: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "frame", label: "Frame", writable: false },
      { name: "appearance", label: "Appearance", writable: false },
      { name: "until", label: "Until", writable: false },
    ],
    interaction: readonlyInteraction, project: projectDeck,
    lane: { layout: "flat", height: videoLaneHeights.component },
  },
];
