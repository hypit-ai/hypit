import { typographyTrackMarkupSurfaces } from "@hypit/typography-track";
import type { TypographyTrackProgram } from "@hypit/typography-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioInspectorFieldDeclaration } from "@hypit/studio-adapter";
import { childEntities, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-adapter";

const typographyProperties = (typographyTrackMarkupSurfaces
  .find((surface) => surface.name === "style")?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? []);

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: typeof typographyProperties[number]): readonly string[] | undefined {
  return "values" in property ? property.values : undefined;
}

type TypographyPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function typographyPlace(domain: "where" | "how", page: string, section: string): TypographyPlacement {
  const id = section.toLowerCase().replaceAll(" ", "-");
  return { domain, page: { id: page.toLowerCase(), label: page }, section: { id, label: section } };
}

const typographyPlacement = new Map<string, TypographyPlacement>();
function placeTypography(names: readonly string[], domain: "where" | "how", page: string, section: string): void {
  for (const name of names) typographyPlacement.set(name, typographyPlace(domain, page, section));
}

placeTypography(["stack-order"], "where", "Layout", "Stacking");
placeTypography([
  "inline-size", "block-size", "padding", "align", "block-align", "wrap", "overflow", "max-lines",
  "minimum-scale", "clip", "columns", "column-gap",
], "where", "Layout", "Area");
placeTypography(["point-anchor-inline", "point-anchor-block"], "where", "Layout", "Point");
placeTypography([
  "path-side", "path-orientation", "path-start-margin", "path-end-margin", "path-align", "path-reverse", "path-overflow",
], "where", "Layout", "Path");
placeTypography([
  "size", "weight", "font-style", "line-height", "tracking", "word-spacing", "kerning", "synthesis", "language",
  "direction", "writing-mode", "baseline-shift", "vertical-align", "tab-size", "indent", "paragraph-before",
  "paragraph-after", "transform", "caps", "cjk-spacing", "punctuation-trim", "metric-edge",
], "how", "Typography", "Typography");
placeTypography(["fill"], "how", "Paint", "Fill");

const typographyColorProperties = new Set(["fill"]);
const typographyTextProperties = new Set(["language", "cjk-spacing", "punctuation-trim", "padding"]);

const typographyInspector: readonly StudioInspectorFieldDeclaration[] = typographyProperties.map((property) => {
  const placement = typographyPlacement.get(property.name);
  if (placement === undefined) throw new Error(`Typography Studio has no explicit Inspector declaration for ${property.name}.`);
  const options = valuesFor(property);
  return {
    binding: `style.${property.name}`, label: title(property.name), ...placement,
    ...(property.summary === undefined ? {} : { summary: property.summary }),
    control: options !== undefined ? "select" : typographyColorProperties.has(property.name) ? "color"
      : typographyTextProperties.has(property.name) ? "text" : "number",
    ...(options === undefined ? {} : { options }),
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
    bindings: [
      { name: "placement" },
      { name: "content" },
      { name: "start", writable: true },
      { name: "end", writable: true },
      { name: "for", writable: true },
      {
        name: "style",
        recipe: { through: ["recipe"], bindings: typographyProperties.map(({ name }) => ({ name })) },
      },
      { name: "motion" },
    ],
    inspector: typographyInspector,
    requiredValues: ["program"], project: projectTypography,
    lane: { heightPx: 48 },
  },
];
