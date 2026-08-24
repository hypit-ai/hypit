import { depthStackMarkupSurfaces } from "@hypit/deck-track";
import type { DepthStackProgram } from "@hypit/deck-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioRecipeParameterDeclaration } from "@hypit/studio-adapter";
import { projectedPointTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

const deckAppearanceRecipe: readonly StudioRecipeParameterDeclaration[] = (depthStackMarkupSurfaces
  .find((surface) => surface.name === "track")?.vocabulary.attributes
  .find((attribute) => attribute.name === "appearance")?.recipe ?? []).map((property) => {
    const when = property.name.includes("frames") || property.name.includes("easing") || property.name.includes("duration");
    const where = /(?:^|[-])(x|y|scale|rotation|stacking|visible)(?:$|[-])/u.test(property.name);
    return {
      name: property.name,
      group: when ? "when" : where ? "where" : "how",
      section: when ? "motion" : where ? "depth" : "appearance",
    };
  });

function cardTitle(card: DepthStackProgram["cards"][number]): string {
  if (card.label.kind === "none") return card.id;
  const text = card.label.document.paragraphs.flatMap((paragraph) => paragraph.inlines)
    .flatMap((inline) => inline.kind === "text" ? [inline.text] : [" "])
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  return text || card.id;
}

function projectDeck(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as DepthStackProgram;
  if (context.placement === undefined) return context.generic();
  const children = new Map(context.placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  return program.cards.map((card, index): StudioEntityDraft => {
    const child = children.get(card.id);
    const temporal = temporalLineageFor(context, card.id, "activation");
    const markerId = temporal?.source.id;
    const endFrameExclusive = program.cards[index + 1]?.activationFrame ?? program.terminalFrame;
    const renders = context.spans.filter((span) => span.id === card.id || span.subjectId === card.id);
    const render = renders[0];
    const appearance = child?.referenceAttributes.appearance
      ?? context.placement?.referenceAttributes.appearance;
    return {
      id: `${context.track.outputRef}:entity:${card.id}`,
      authoredId: card.id,
      ...(markerId === undefined ? {} : { markerId }),
      display: { title: cardTitle(card), layers: [] },
      startFrame: card.activationFrame,
      endFrameExclusive,
      stackOrder: program.spec.stackingOrder ?? render?.stackOrder ?? 0,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(render === undefined ? {} : { presentId: render.id, renderIds: renders.map((span) => span.id) }),
      ...(appearance === undefined ? {} : { parameterReferences: { appearance } }),
      presentation: { entity: "deck-card", chrome: "standard" },
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const deckTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/deck-track"] },
    family: "deck", tone: "orange", icon: "layers", requiredValues: ["program"],
    timelineEdits: projectedPointTimelineEdits(),
    parameters: [
      { name: "source", label: "Source", writable: false },
      { name: "extent", label: "Extent", writable: false },
      {
        name: "appearance", label: "Appearance", writable: false,
        recipe: { parameters: deckAppearanceRecipe },
      },
      { name: "label", label: "Label", writable: true },
    ],
    project: projectDeck,
    lane: { heightPx: 52 },
  },
];
