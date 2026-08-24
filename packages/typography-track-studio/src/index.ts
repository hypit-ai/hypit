import { typographyTrackMarkupSurfaces } from "@hypit/typography-track";
import type { TypographyTrackProgram } from "@hypit/typography-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioRecipeParameterDeclaration } from "@hypit/studio-adapter";
import { childEntities, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-adapter";

const typographyStyleRecipe: readonly StudioRecipeParameterDeclaration[] = (typographyTrackMarkupSurfaces
  .find((surface) => surface.name === "style")?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? []).map((property) => {
    const where = [
      "stack-order", "inline-size", "block-size", "padding", "align", "block-align", "wrap", "overflow",
      "max-lines", "minimum-scale", "clip", "columns", "column-gap", "point-anchor-x", "point-anchor-y",
    ].includes(property.name) || property.name.startsWith("path-");
    return {
      name: property.name,
      group: where ? "where" : "how",
      section: where ? "layout" : "typography",
    };
  });

function textOf(item: TypographyTrackProgram["items"][number]): string {
  return item.document.paragraphs.map((paragraph) => paragraph.inlines
    .map((inline) => inline.kind === "text" ? inline.text : " ")
    .join(""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function projectTypography(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as TypographyTrackProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
  }));
  return childEntities(context, items, "typography-item", "standard").map((entity, index) => {
    const item = program.items[index];
    if (item === undefined) return entity;
    const label = textOf(item);
    const temporal = temporalLineageFor(context, item.id, "window");
    return {
      ...entity,
      display: { ...entity.display, layers: label.length === 0 ? [] : [textLayer(label)] },
      ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
        ? {}
        : { markerId: temporal.source.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const typographyTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/typography-track"] },
    family: "text", tone: "violet", icon: "text",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    parameters: [
      { name: "placement", label: "Placement", writable: false },
      { name: "content", label: "Content", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "for", label: "For", writable: true },
      {
        name: "style", label: "Style", writable: false,
        recipe: { through: ["recipe"], parameters: typographyStyleRecipe },
      },
      { name: "motion", label: "Motion", writable: false },
    ],
    requiredValues: ["program"], project: projectTypography,
    lane: { heightPx: 48 },
  },
];
