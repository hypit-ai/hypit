import { captionFineMarkupSurfaces } from "@hypit/caption-fine";
import type { FineCaptionSchedule } from "@hypit/caption-fine";
import type { CaptionDocument } from "@hypit/narrative";
import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEntityDraft,
  StudioInspectorFieldDeclaration,
} from "@hypit/studio-adapter";
import { requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-adapter";

const styleSurface = captionFineMarkupSurfaces.find((surface) => surface.name === "style");
const recipeVocabulary = styleSurface?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? [];

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: typeof recipeVocabulary[number]): readonly string[] | undefined {
  return "values" in property ? property.values : undefined;
}

type CaptionPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function captionPlace(domain: "where" | "how" | "when", page: string, section: string): CaptionPlacement {
  return {
    domain,
    page: { id: page, label: title(page) },
    section: { id: section, label: title(section) },
  };
}

const captionPlacement = new Map<string, CaptionPlacement>();
function placeCaption(names: readonly string[], domain: "where" | "how" | "when", page: string, section: string): void {
  for (const name of names) captionPlacement.set(name, captionPlace(domain, page, section));
}

placeCaption(["stack-order", "x", "y", "width", "height", "anchor-x", "anchor-y"], "where", "placement", "region");
placeCaption([
  "align", "block-align", "inline-size", "wrap", "overflow", "max-lines", "max-words-per-line", "direction",
  "line-height", "letter-spacing", "word-gap",
], "where", "flow", "flow");
placeCaption(["size", "kerning", "caps", "text-transform"], "how", "text", "typography");
placeCaption([
  "fill", "opacity", "gradient-from", "gradient-to", "gradient-angle", "stroke-color", "stroke-width", "shadow-color",
  "shadow-opacity", "shadow-x", "shadow-y", "shadow-blur", "shadow-spread", "long-shadow-color", "long-shadow-opacity",
  "long-shadow-distance", "long-shadow-angle", "glow-color", "glow-opacity", "glow-blur", "glow-spread",
], "how", "paint", "base-paint");
placeCaption([
  "active-fill", "active-opacity", "active-gradient-from", "active-gradient-to", "active-gradient-angle",
  "active-stroke-color", "active-stroke-width", "active-shadow-color", "active-shadow-opacity", "active-shadow-x",
  "active-shadow-y", "active-shadow-blur", "active-shadow-spread", "active-long-shadow-color",
  "active-long-shadow-opacity", "active-long-shadow-distance", "active-long-shadow-angle", "active-glow-color",
  "active-glow-opacity", "active-glow-blur", "active-glow-spread",
], "how", "paint", "active-paint");
placeCaption([
  "background", "border-color", "border-width", "padding", "radius", "cue-shadow-color", "cue-shadow-opacity",
  "cue-shadow-x", "cue-shadow-y", "cue-shadow-blur", "cue-shadow-spread",
], "how", "cue-box", "cue-box");
placeCaption([
  "underline", "underline-color", "underline-thickness", "underline-offset", "active-underline-color",
  "active-underline-thickness", "active-underline-offset", "active-box-background", "active-box-border-color",
  "active-box-border-width", "active-box-padding", "active-box-radius",
], "how", "decoration", "decoration");
placeCaption(["lead-frames", "tail-frames", "handoff"], "when", "cue", "envelope");
placeCaption(["cue-enter", "cue-enter-frames", "cue-exit", "cue-exit-frames"], "when", "cue", "cue");
placeCaption([
  "karaoke", "karaoke-transition", "active-underline", "active-box", "active-box-continuity", "active-box-enter",
  "active-box-exit", "active-box-transition-frames", "atom-enter", "atom-enter-frames", "atom-exit", "atom-exit-frames",
  "atom-reveal", "active-response", "active-response-frames", "active-scale", "slide-distance",
], "when", "token", "token");
placeCaption(["loop", "loop-target", "loop-period-frames", "loop-intensity"], "when", "loop", "loop");

const captionColorProperties = new Set([
  "fill", "gradient-from", "gradient-to", "stroke-color", "shadow-color", "long-shadow-color", "glow-color",
  "active-fill", "active-gradient-from", "active-gradient-to", "active-stroke-color", "active-shadow-color",
  "active-long-shadow-color", "active-glow-color", "background", "border-color", "cue-shadow-color", "underline-color",
  "active-underline-color", "active-box-background", "active-box-border-color",
]);
const captionTextProperties = new Set(["loop"]);

export const captionFineInspectorFields: readonly StudioInspectorFieldDeclaration[] = recipeVocabulary.map((property) => {
  const placement = captionPlacement.get(property.name);
  if (placement === undefined) throw new Error(`Caption Studio has no explicit Inspector declaration for ${property.name}.`);
  const options = valuesFor(property);
  return {
    binding: `program.${property.name}`,
    label: title(property.name),
    ...placement,
    summary: property.summary,
    control: options !== undefined ? "select" : captionColorProperties.has(property.name) ? "color"
      : captionTextProperties.has(property.name) ? "text" : "number",
    ...(options === undefined ? {} : { options }),
  };
});

function captionDocument(context: StudioAdapterContext, id: string): CaptionDocument | undefined {
  for (const value of context.values.values()) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Partial<CaptionDocument>;
    if (candidate.id === id && Array.isArray(candidate.units) && Array.isArray(candidate.words)) {
      return candidate as CaptionDocument;
    }
  }
  return undefined;
}

function cueText(document: CaptionDocument | undefined, unitIds: readonly string[]): string {
  if (document === undefined) return "";
  const selected = new Set(unitIds);
  return document.words
    .filter((word) => selected.has(word.unitId))
    .map((word) => word.text)
    .join(" ")
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    .trim();
}

function projectCaption(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const schedule = requiredSurfaceValue(context, "schedule") as FineCaptionSchedule;
  const document = captionDocument(context, schedule.documentId);
  const rendered = new Map(context.generic().flatMap((entity) =>
    entity.presentId === undefined ? [] : [[entity.presentId, entity] as const]));
  return schedule.cues.map((cue): StudioEntityDraft => {
    const base = rendered.get(cue.id);
    const label = cueText(document, cue.units.map((unit) => unit.unitId));
    const temporal = temporalLineageFor(context, cue.id);
    const authoredId = context.placement?.id ?? cue.id;
    return {
      ...(base ?? {
        id: `${context.track.outputRef}:entity:${cue.id}`,
        authoredId: cue.id,
        display: { title: "Caption", layers: [] },
        startFrame: cue.visibleStartFrame,
        endFrameExclusive: cue.visibleEndFrameExclusive,
        stackOrder: 0,
        presentId: cue.id,
        renderIds: [cue.id],
      }),
      authoredId,
      ...(context.placement === undefined ? {} : { elementRange: context.placement.range }),
      display: {
        title: "Caption",
        layers: label.length === 0 ? [] : [textLayer(label)],
      },
      startFrame: cue.visibleStartFrame,
      endFrameExclusive: cue.visibleEndFrameExclusive,
      presentation: { entity: "caption-cue", chrome: "standard" },
      parameterReferences: { program: cue.styleId },
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const captionFineStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/caption-fine"] },
    family: "caption", tone: "magenta", icon: "captions",
    bindings: [
      {
        name: "program",
        recipe: { through: ["recipe"], bindings: recipeVocabulary.map(({ name }) => ({ name })) },
      },
    ],
    inspector: captionFineInspectorFields,
    requiredValues: ["schedule"], project: projectCaption,
    lane: { heightPx: 48 },
  },
];
