import { captionFineMarkupSurfaces } from "@hypit/caption-fine";
import type { FineCaptionSchedule } from "@hypit/caption-fine";
import type { CaptionDocument } from "@hypit/narrative";
import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEntityDraft,
  StudioRecipeParameterDeclaration,
} from "@hypit/studio-adapter";
import { requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-adapter";

const WHERE_PROPERTIES = new Set([
  "stack-order", "x", "y", "width", "height", "anchor-x", "anchor-y", "align", "block-align",
  "inline-size", "wrap", "overflow", "max-lines", "max-words-per-line", "direction", "line-height",
  "letter-spacing", "word-gap",
]);

const TIMED_ACTIVE_BOX_PROPERTIES = new Set([
  "active-box", "active-box-continuity", "active-box-enter", "active-box-exit", "active-box-transition-frames",
]);

function groupFor(name: string): "where" | "how" | "when" {
  if (WHERE_PROPERTIES.has(name)) return "where";
  if (name === "lead-frames" || name === "tail-frames" || name === "handoff"
    || name === "karaoke" || name === "karaoke-transition" || name === "active-underline"
    || name.startsWith("cue-enter") || name.startsWith("cue-exit") || name.startsWith("atom-")
    || name.startsWith("active-response") || name.startsWith("loop")
    || name === "slide-distance" || name === "active-scale" || TIMED_ACTIVE_BOX_PROPERTIES.has(name)) return "when";
  return "how";
}

function sectionFor(name: string, group: "where" | "how" | "when"): string {
  if (group === "where") return ["x", "y", "width", "height", "anchor-x", "anchor-y", "stack-order"].includes(name)
    ? "region" : "flow";
  if (group === "when") {
    if (["lead-frames", "tail-frames", "handoff"].includes(name)) return "envelope";
    if (name.startsWith("cue-")) return "cue";
    if (name.startsWith("loop")) return "loop";
    return "token";
  }
  if (["size", "kerning", "caps", "text-transform"].includes(name)) return "typography";
  if (name === "background" || name === "border-color" || name === "border-width" || name === "padding"
    || name === "radius" || name.startsWith("cue-shadow")) return "cue-box";
  if (name.startsWith("active-box") || name.includes("underline")) return "decoration";
  return name.startsWith("active-") ? "active-paint" : "base-paint";
}

const styleSurface = captionFineMarkupSurfaces.find((surface) => surface.name === "style");
const recipeVocabulary = styleSurface?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? [];

export const captionFineRecipeParameters: readonly StudioRecipeParameterDeclaration[] = recipeVocabulary.map((property) => {
  const group = groupFor(property.name);
  return { name: property.name, group, section: sectionFor(property.name, group) };
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
    parameters: [
      {
        name: "program", label: "Program", writable: false,
        recipe: { through: ["recipe"], parameters: captionFineRecipeParameters },
      },
    ],
    requiredValues: ["schedule"], project: projectCaption,
    lane: { heightPx: 48 },
  },
];
