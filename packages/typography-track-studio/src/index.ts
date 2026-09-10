import { openFontStudioFields } from "@hypit/fonts-open/studio";
import { typographyTrackMarkupSurfaces, typographyTrackModuleRef, typographyTrackTypes } from "@hypit/typography-track";
import type { TypographyTrackProgram } from "@hypit/typography-track";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioEntityDraft, StudioInspectorFieldDeclaration } from "@hypit/studio-adapter";
import { childEntities, requiredSurfaceValue, temporalLineageFor, temporalSemanticSource, textLayer } from "@hypit/studio-adapter";

const fontInspector = openFontStudioFields("style");

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

function projectTypography(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as TypographyTrackProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
    sourceTypes: [typographyTrackTypes.itemSpec, typographyTrackTypes.plainItemSpec],
  }));
  return childEntities(context, items, "typography-item", "standard").map((entity, index) => {
    const item = program.items[index];
    if (item === undefined) return entity;
    const label = textOf(item);
    const temporal = temporalLineageFor(context, item.id, "window");
    const semanticSource = temporalSemanticSource(temporal);
    return {
      ...entity,
      display: { ...entity.display, layers: label.length === 0 ? [] : [textLayer(label)] },
      ...(semanticSource?.id === undefined
        ? {}
        : { markerId: semanticSource.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const typographyTrackStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "track", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [typographyTrackModuleRef] },
    family: "text", tone: "violet", icon: "text",
    bindings: [
      { name: "placement" },
      { name: "content" },
      {
        name: "style",
        referenced: [fontInspector.binding],
        recipe: { through: ["recipe"], bindings: typographyProperties.map(({ name }) => ({ name })) },
      },
      { name: "motion" },
    ],
    inspector: [...fontInspector.fields, ...typographyInspector],
    requiredValues: ["program"], project: projectTypography,
    lane: { heightPx: 48 },
  },
];
