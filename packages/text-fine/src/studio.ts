import { textFineMarkupSurfaces, textFineModuleRef, textFineTypes } from "./manifest.js";
import type { FineTextOccurrence, TextItem } from "./types.js";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioItemDraft, StudioInspectorFieldDeclaration, StudioSourceBindingDeclaration } from "@hypit/studio-companion";
import { childItems, requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-companion";

const typographyProperties = (textFineMarkupSurfaces
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

placeTypography([
  "size", "weight", "font-style", "line-height", "tracking", "word-spacing", "kerning", "synthesis", "language",
  "direction", "writing-mode", "baseline-shift", "vertical-align", "tab-size", "indent", "paragraph-before",
  "paragraph-after", "transform", "caps", "cjk-spacing", "punctuation-trim",
], "how", "Typography", "Typography");
placeTypography(["fill"], "how", "Paint", "Fill");

const typographyColorProperties = new Set(["fill"]);
const typographyTextProperties = new Set(["language", "cjk-spacing", "punctuation-trim"]);

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

function textOf(item: Pick<TextItem, "document">): string {
  return item.document.paragraphs.map((paragraph) => paragraph.inlines
    .map((inline) => inline.kind === "text" ? inline.text : " ")
    .join(""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function projectFineText(context: StudioTrackCompanionContext): readonly StudioItemDraft[] {
  const occurrence = requiredSurfaceValue(context, "occurrence") as FineTextOccurrence;
  const item = childItems(context, [{
    id: occurrence.id,
    startFrame: occurrence.span.startFrame,
    endFrameExclusive: occurrence.span.endFrameExclusive,
    stackOrder: 0,
    sourceTypes: [textFineTypes.itemSpec, textFineTypes.plainItemSpec],
  }], "typography-item", "standard")[0];
  if (item === undefined) return [];
  const label = textOf(occurrence);
  const temporal = temporalLineageFor(context, occurrence.id, "window");
  return [{
    ...item,
    authoredId: context.placement?.id ?? occurrence.id,
    display: { ...item.display, title: context.placement?.id ?? occurrence.id, layers: label.length === 0 ? [] : [textLayer(label)] },
    ...(context.placement === undefined ? {} : { elementLocation: { path: context.placement.sourcePath, range: context.placement.range } }),
    ...(temporal === undefined ? {} : { temporal }),
  }];
}

const placementBindings: Readonly<Record<"flow" | "point" | "path", readonly StudioSourceBindingDeclaration[]>> = {
  flow: ["inline-size", "block-size", "padding", "align", "block-align", "wrap", "overflow", "max-lines", "minimum-scale", "clip", "columns", "column-gap", "metric-edge"].map((name) => ({ name, writable: true })),
  point: ["anchor-inline", "anchor-block"].map((name) => ({ name, writable: true })),
  path: ["side", "orientation", "start-margin", "end-margin", "align", "reverse", "overflow"].map((name) => ({ name, writable: true })),
};

const placementOptions = new Map<string, readonly string[]>([
  ["inline-size", ["hug", "fixed"]], ["block-size", ["hug", "fixed"]],
  ["align:flow", ["start", "center", "end", "justify"]], ["align:path", ["start", "center", "end"]],
  ["block-align", ["start", "center", "end"]], ["wrap", ["none", "word", "grapheme"]],
  ["overflow:flow", ["visible", "clip", "ellipsis", "shrink"]], ["overflow:path", ["visible", "clip"]],
  ["metric-edge", ["line-box", "cap-height", "ink"]], ["anchor-inline", ["start", "center", "end"]],
  ["anchor-block", ["start", "center", "end"]], ["side", ["left", "right"]],
  ["orientation", ["follow", "upright"]], ["reverse", ["true", "false"]], ["clip", ["true", "false"]],
]);

function occurrenceInspector(form: "flow" | "point" | "path"): readonly StudioInspectorFieldDeclaration[] {
  const direct = placementBindings[form].map(({ name }) => {
    const options = placementOptions.get(`${name}:${form}`) ?? placementOptions.get(name);
    return {
      binding: name, label: title(name), ...typographyPlace("where", "Layout", title(form)),
      control: options === undefined ? (name === "padding" ? "text" as const : "number" as const) : "select" as const,
      ...(options === undefined ? {} : { options }),
    };
  });
  return [...direct, ...typographyInspector];
}

function fineTextCompanion(form: "flow" | "point" | "path"): StudioTrackCompanion {
  const geometry = form === "flow" ? "within" : form;
  return {
    id: form, role: "track",
    output: { type: compositionTypes.visualTrack, surface: form, modules: [textFineModuleRef] },
    family: "typography", tone: "violet", icon: "text",
    bindings: [
      { name: geometry },
      { name: "content" },
      ...placementBindings[form],
      {
        name: "style",
        referenced: [{ name: "font", companion: true }],
        recipe: { through: ["recipe"], bindings: typographyProperties.map(({ name }) => ({ name })) },
      },
      { name: "motion" },
      ...(form === "path" ? [{ name: "path-motion" }] : []),
    ],
    inspector: occurrenceInspector(form),
    requiredValues: ["occurrence"], project: projectFineText,
    lane: { heightPx: 48 },
  };
}

export const textFineStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  fineTextCompanion("flow"),
  fineTextCompanion("point"),
  fineTextCompanion("path"),
];
