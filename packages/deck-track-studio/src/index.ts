import { depthStackMarkupSurfaces } from "@hypit/deck-track";
import type { DepthStackProgram } from "@hypit/deck-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioInspectorFieldDeclaration } from "@hypit/studio-adapter";
import { projectedPointTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

const deckProperties = (depthStackMarkupSurfaces
  .find((surface) => surface.name === "track")?.vocabulary.attributes
  .find((attribute) => attribute.name === "appearance")?.recipe ?? []);

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: typeof deckProperties[number]): readonly string[] | undefined {
  return "values" in property ? property.values : undefined;
}

type DeckPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function deckPlace(domain: "where" | "how" | "when", page: string, section: string): DeckPlacement {
  const id = section.toLowerCase().replaceAll(" ", "-");
  return { domain, page: { id: page.toLowerCase(), label: page }, section: { id, label: section } };
}

const deckPlacement = new Map<string, DeckPlacement>();
function placeDeck(names: readonly string[], domain: "where" | "how" | "when", page: string, section: string): void {
  for (const name of names) deckPlacement.set(name, deckPlace(domain, page, section));
}

placeDeck([
  "visible-previous", "visible-next", "wrap", "current-x", "current-y", "current-scale", "current-rotation",
  "current-stacking", "previous-x-step", "previous-y-step", "previous-scale-step", "previous-rotation-step",
  "previous-rotation-mode", "previous-stacking-step", "next-x-step", "next-y-step", "next-scale-step",
  "next-rotation-step", "next-rotation-mode", "next-stacking-step",
], "where", "Depth", "Card Stack");
placeDeck(["stack-order"], "where", "Frame", "Stacking");
placeDeck(["clip", "radius", "padding"], "where", "Frame", "Geometry");
placeDeck([
  "fit", "frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y", "fit-constraint",
], "where", "Frame", "Fit");
placeDeck([
  "current-opacity", "current-brightness", "current-contrast", "current-saturation", "previous-opacity-step",
  "next-opacity-step", "border-width", "border-style", "border-color", "shadows", "frame-paint", "opacity",
  "blur", "brightness", "contrast", "saturation",
], "how", "Appearance", "Paint");
placeDeck(["playback", "trim-start", "trim-end", "playback-future", "playback-past"], "how", "Appearance", "Playback");
placeDeck(["reflow-frames", "reflow-easing"], "when", "Motion", "Reflow");
placeDeck(["enter", "enter-frames", "enter-easing", "enter-direction", "enter-amount", "enter-origin"], "when", "Motion", "Enter");
placeDeck(["sustain"], "when", "Motion", "Sustain");
placeDeck(["exit", "exit-frames", "exit-easing", "exit-direction", "exit-amount", "exit-origin"], "when", "Motion", "Exit");

const deckColorProperties = new Set(["border-color"]);
const deckTextProperties = new Set(["padding", "shadows", "frame-paint", "sustain"]);

const deckInspector: readonly StudioInspectorFieldDeclaration[] = deckProperties.map((property) => {
  const placement = deckPlacement.get(property.name);
  if (placement === undefined) throw new Error(`Deck Studio has no explicit Inspector declaration for ${property.name}.`);
  const options = valuesFor(property);
  return {
    binding: `appearance.${property.name}`, label: title(property.name), ...placement,
    ...(property.summary === undefined ? {} : { summary: property.summary }),
    control: options !== undefined ? "select" : deckColorProperties.has(property.name) ? "color"
      : deckTextProperties.has(property.name) ? "text" : "number",
    ...(options === undefined ? {} : { options }),
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
    bindings: [
      { name: "source" },
      { name: "extent" },
      {
        name: "appearance",
        recipe: { bindings: deckProperties.map(({ name }) => ({ name })) },
      },
      { name: "label", writable: true },
    ],
    inspector: [
      ...deckInspector,
      {
        binding: "label", label: "Label", domain: "how",
        page: { id: "label", label: "Label" }, section: { id: "label", label: "Label" }, control: "text",
      },
    ],
    project: projectDeck,
    lane: { heightPx: 52 },
  },
];
