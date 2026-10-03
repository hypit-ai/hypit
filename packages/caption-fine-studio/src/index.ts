import { temporalTypes } from "@hypit/temporal";
import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import { openFontStudioFields } from "@hypit/fonts-open/studio";
import { fineCaptionEditableDefaults, captionFineMarkupSurfaces, captionFineModuleRef } from "@hypit/caption-fine";
import type { FineCaptionSchedule } from "@hypit/caption-fine";
import { compositionTypes } from "@hypit/composition";
import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDocument } from "@hypit/narrative";
import type {
  StudioTrackCompanion,
  StudioTrackCompanionContext,
  StudioEntityDraft,
  StudioInspectorFieldDeclaration,
} from "@hypit/studio-adapter";
import { authoredChildFor, temporalLineageFor, temporalSemanticSource, requiredReferencedValue, requiredSurfaceValue } from "@hypit/studio-adapter";

const styleSurface = captionFineMarkupSurfaces.find((surface) => surface.name === "style");

const fontInspector = openFontStudioFields("style");

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
  "align", "block-align", "inline-size", "wrap", "max-lines", "max-words-per-line", "direction",
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
placeCaption(["emphasis-words", "emphasis-fill", "emphasis-stroke-color"], "how", "paint", "emphasis-paint");
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
placeCaption([
  "cue-enter", "cue-enter-frames", "cue-enter-start-scale", "cue-exit", "cue-exit-frames",
], "when", "cue", "cue");
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
  "emphasis-fill", "emphasis-stroke-color",
]);
const captionTextProperties = new Set(["loop", "emphasis-words"]);
const captionPercentProperties = new Set(["x", "y", "width", "height", "opacity", "active-opacity", "active-scale"]);
const captionPixelProperties = new Set(["size", "letter-spacing", "word-gap", "radius", "stroke-width", "border-width", "shadow-blur", "glow-blur"]);

export const captionFineInspectorFields: readonly StudioInspectorFieldDeclaration[] = recipeVocabulary.map((property) => {
  const placement = captionPlacement.get(property.name);
  if (placement === undefined) throw new Error(`Caption Studio has no explicit Inspector declaration for ${property.name}.`);
  const options = valuesFor(property);
  return {
    binding: `style.${property.name}`,
    label: title(property.name),
    ...placement,
    summary: property.summary,
    control: options !== undefined ? "select" : captionColorProperties.has(property.name) ? "color"
      : captionTextProperties.has(property.name) ? "text" : "number",
    ...(options === undefined ? {} : { options }),
    ...(captionPercentProperties.has(property.name) ? { unit: "%", number: { scale: 100, step: 1 } } : {}),
    ...(captionPixelProperties.has(property.name) ? { unit: "px", number: { step: 1 } } : {}),
  };
});

function cueText(document: CaptionDocument | undefined, unitIds: readonly string[]): string {
  if (document === undefined) return "";
  const selected = new Set(unitIds);
  return document.words
    .filter((word) => selected.has(word.unitId))
    .map((word, index) => (index === 0 ? "" : word.separatorBefore) + word.text)
    .join("");
}

export function projectCaptionContents(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const content = requiredSurfaceValue(context, "content") as TimedCaptionProjection;
  const schedule = requiredSurfaceValue(context, "schedule") as FineCaptionSchedule;
  const document = requiredReferencedValue(context, "document", narrativeTypes.captionDocument) as CaptionDocument;
  if (document.id !== content.documentId) throw new Error("Caption content belongs to another CaptionDocument.");
  return content.cues.map((cue, index): StudioEntityDraft => ({
    id: `${context.track.outputRef}:cue:${cue.id}`, authoredId: cue.id,
    display: { title: `#${index + 1}`, layers: [{ kind: "text", role: "content", text: cueText(document, cue.units.map(unit => unit.unitId)) }] },
    startFrame: cue.startFrame, endFrameExclusive: cue.endFrameExclusive, stackOrder: 0,
    renderIds: schedule.cues.filter(item => item.cueId === cue.id).map(item => item.id),
    presentation: { entity: "caption-cue", chrome: "standard" },
    inspector: [{ id: "range", label: "Range", domain: "when", section: { id: "cue", label: "Cue" }, value: `${cue.startFrame}–${cue.endFrameExclusive}`, unit: "f" }],
  }));
}

export function projectCaption(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as CaptionProgram;
  const uses: StudioEntityDraft[] = program.uses.map((use, index) => {
    const authoredId = use.window.subjectId;
    const child = authoredChildFor(context, authoredId, [temporalTypes.windowSpec]);
    if (child === undefined) throw new Error(`Caption Use ${authoredId} has no author provenance.`);
    const temporal = temporalLineageFor(context, authoredId, "window");
    const semantic = temporalSemanticSource(temporal);
    return {
      id: `${context.track.outputRef}:use:${authoredId}`, authoredId,
      display: { title: use.styleId, layers: [] },
      ...use.window.span, stackOrder: index, elementRange: child.range,
      ...(temporal === undefined ? {} : { temporal }),
      ...(semantic === undefined ? {} : { markerId: semantic.id }),
      presentation: { entity: "caption-use", chrome: "standard" }, band: "uses",
      inspector: [{ id: "range", label: "Range", domain: "when", section: { id: "placement", label: "Placement" }, value: `${use.window.span.startFrame}–${use.window.span.endFrameExclusive}`, unit: "f" }],
    };
  });
  return [...projectCaptionContents(context), ...uses];
}

export const captionFineStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "track", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [captionFineModuleRef] },
    family: "caption", tone: "magenta", icon: "captions",
    lane: { heightPx: 36 },
    bands: [{
      id: "uses", placement: "after", heightPx: 15, display: "label",
      bindings: [{ name: "style", companion: true }],
      inspector: [{ binding: "style", label: "Style", domain: "how", section: { id: "style", label: "Style" }, control: "text" }],
    }],
    requiredValues: ["content", "schedule", "program"], project: projectCaption,

  },
];

export const captionFineStudioParameterCompanions: readonly import("@hypit/studio-adapter").StudioParameterCompanion[] = [{
  id: "style", match: { module: captionFineModuleRef, surface: "style" },
  bindings: [fontInspector.binding, { name: "recipe", recipe: { bindings: recipeVocabulary.map(({ name }) => ({ name,
    ...(Object.hasOwn(fineCaptionEditableDefaults, name) ? { fallback: fineCaptionEditableDefaults[name as keyof typeof fineCaptionEditableDefaults] } : {}),
  })) } }],
  inspector: [
    ...fontInspector.fields.map(field => ({ ...field, binding: field.binding.replace(/^style\./u, "") })),
    ...captionFineInspectorFields.map(field => ({ ...field, binding: field.binding.replace(/^style\./u, "recipe.") })),
  ],
}];
