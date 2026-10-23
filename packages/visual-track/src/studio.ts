import { compositionTypes } from "@hypit/composition";
import type {
  StudioTrackCompanion,
  StudioTrackCompanionContext,
  StudioItemDraft,
  StudioInspectorFieldDeclaration,
  StudioMaterialPreview,
  StudioSourceBindingDeclaration,
} from "@hypit/studio-companion";
import { artifactPreview, authoredItemTitle, childItems, previewLayer, requiredSurfaceValue, temporalLineageFor, temporalDomainMarker } from "@hypit/studio-companion";
import { visualTreatmentDefaults } from "./author.js";
import { visualTrackMarkupSurfaces, visualTrackModuleRef, visualTrackTypes } from "./manifest.js";
import type { MediaLayerProgram, VisualTrackProgram } from "./types.js";

const frameParameters: readonly StudioSourceBindingDeclaration[] = [
  { name: "within" },
  { name: "left", writable: true },
  { name: "top", writable: true },
  { name: "right", writable: true },
  { name: "bottom", writable: true },
  { name: "x", writable: true },
  { name: "y", writable: true },
  { name: "width", writable: true },
  { name: "height", writable: true },
];

const extentParameters: readonly StudioSourceBindingDeclaration[] = [
  { name: "width", writable: true },
  { name: "height", writable: true },
];

const visualTrackSurface = visualTrackMarkupSurfaces.find((surface) => surface.name === "track");
const visualClipAttributes = visualTrackSurface?.vocabulary.children?.find((child) => child.tag === "Clip")?.attributes ?? [];

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: { readonly name: string }): readonly string[] | undefined {
  return "values" in property ? (property as { readonly values: readonly string[] }).values : undefined;
}

type MediaPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function mediaPlace(domain: "where" | "how" | "when", page: string, section: string): MediaPlacement {
  const id = section.toLowerCase().replaceAll(" ", "-");
  return { domain, page: { id: page.toLowerCase(), label: page }, section: { id, label: section } };
}

const mediaPlacement = new Map<string, MediaPlacement>();
function placeMedia(names: readonly string[], domain: "where" | "how" | "when", page: string, section: string): void {
  for (const name of names) mediaPlacement.set(name, mediaPlace(domain, page, section));
}

placeMedia(["clip", "radius", "padding"], "where", "Frame", "Geometry");
placeMedia(["opacity", "blur", "brightness", "contrast", "saturation"], "how", "Image", "Image");
placeMedia(["border-width", "border-style", "border-color", "shadows", "frame-paint"], "how", "Frame", "Paint");

const mediaColorProperties = new Set(["border-color"]);
const mediaTextProperties = new Set(["padding", "shadows", "frame-paint"]);
const mediaPercentProperties = new Set(["opacity", "brightness", "contrast", "saturation"]);
const mediaPixelProperties = new Set(["radius", "blur", "border-width"]);

function treatmentRecipe(): {
  readonly bindings: readonly import("@hypit/studio-companion").StudioRecipeBindingDeclaration[];
  readonly inspector: readonly StudioInspectorFieldDeclaration[];
} {
  const attribute = visualClipAttributes.find((candidate) => candidate.name === "treatment");
  const properties = attribute !== undefined && "recipe" in attribute ? attribute.recipe : [];
  return {
    bindings: properties.map(({ name: property }) => ({ name: property,
      ...(Object.hasOwn(visualTreatmentDefaults, property) ? { fallback: visualTreatmentDefaults[property as keyof typeof visualTreatmentDefaults] } : {}),
    })),
    inspector: properties.map((property) => {
      const placement = mediaPlacement.get(property.name);
      if (placement === undefined) throw new Error(`Media Studio has no explicit Inspector declaration for ${property.name}.`);
      const options = valuesFor(property);
      const control = options !== undefined ? "select" as const
        : mediaColorProperties.has(property.name) ? "color" as const
        : mediaTextProperties.has(property.name) ? "text" as const : "number" as const;
      return {
        binding: `treatment.${property.name}`,
        label: title(property.name),
        ...placement,
        ...(property.summary === undefined ? {} : { summary: property.summary }),
        control,
        ...(mediaPercentProperties.has(property.name) ? { unit: "%", number: { scale: 100, step: 1 } } : {}),
        ...(mediaPixelProperties.has(property.name) ? { unit: "px", number: { step: 1 } } : {}),
        ...(options === undefined ? {} : { options }),
      };
    }),
  };
}

export const visualClipTreatmentStudioFields = treatmentRecipe();

function clipOptions(name: string): readonly string[] {
  const attribute = visualClipAttributes.find((candidate) => candidate.name === name);
  const options = attribute === undefined ? undefined : valuesFor(attribute);
  if (options === undefined) throw new Error(`Visual Studio requires declared values for Clip.${name}.`);
  return options;
}

const fitOptions = clipOptions("fit");
const fitConstraintOptions = clipOptions("fit-constraint");
const directClipBindings: readonly StudioSourceBindingDeclaration[] = [
  { name: "fit", writable: true, fallback: "contain" },
  ...["frame-x", "frame-y", "content-x", "content-y"].map((name) => ({ name, writable: true, fallback: 0.5 })),
  ...["fit-offset-x", "fit-offset-y"].map((name) => ({ name, writable: true, fallback: 0 })),
  { name: "fit-constraint", writable: true, fallback: "bounded" },
  { name: "source-time" },
];

const directClipInspector: readonly StudioInspectorFieldDeclaration[] = [
  { binding: "fit", label: "Fit", ...mediaPlace("where", "Fit", "Fit"), control: "select", options: fitOptions },
  ...["frame-x", "frame-y", "content-x", "content-y"].map((binding) => ({
    binding, label: title(binding), ...mediaPlace("where", "Fit", "Alignment"), control: "number" as const,
    unit: "%", number: { scale: 100, step: 1 },
  })),
  ...["fit-offset-x", "fit-offset-y"].map((binding) => ({
    binding, label: title(binding), ...mediaPlace("where", "Fit", "Offset"), control: "number" as const,
    unit: "px", number: { step: 1 },
  })),
  { binding: "fit-constraint", label: "Fit Constraint", ...mediaPlace("where", "Fit", "Fit"), control: "select", options: fitConstraintOptions },
];

function materialPreview(
  layers: readonly MediaLayerProgram[],
): StudioMaterialPreview | undefined {
  const layer = layers.find((candidate) => candidate.kind === "sample");
  if (layer?.kind !== "sample") return undefined;
  if (layer.source.kind === "surface") return undefined;
  return artifactPreview(layer.source.kind === "still" ? "image" : "video", layer.source.artifact.resource);
}

function projectVisualItems(context: StudioTrackCompanionContext): readonly StudioItemDraft[] {
  const program = requiredSurfaceValue(context, "program") as VisualTrackProgram;
  const clips = program.clips.map((clip, index) => ({
    id: clip.id,
    subjectId: clip.subjectId,
    startFrame: clip.span.startFrame,
    endFrameExclusive: clip.span.endFrameExclusive,
    stackOrder: index,
    preview: materialPreview(clip.layers),
    temporalInput: "window",
    sourceTypes: [visualTrackTypes.clipSpec],
  }));
  return childItems(context, clips, "visual-clip", "standard")
    .map((projected, index) => {
      const clip = clips[index];
      if (clip === undefined) return projected;
      const temporal = temporalLineageFor(context, clip.id, clip.temporalInput);
      const marker = temporalDomainMarker(temporal);
      return {
        ...projected,
        ...(projected.terminalLinks === undefined ? {} : {
          terminalLinks: projected.terminalLinks.map((link) => ({ ...link, elementId: `${clip.id}:frame` })),
        }),
        display: {
          ...projected.display,
          title: authoredItemTitle(context, projected.authoredId, clip.sourceTypes, ["image", "media", "surface"]),
          ...(clip.preview === undefined ? {} : {
            layers: [previewLayer(clip.preview, clip.preview.kind === "video" ? "storyboard" : "repeat-x")],
          }),
        },
        ...(marker === undefined ? {} : { marker }),
        ...(temporal === undefined ? {} : { temporal }),
      };
    });
}

const frameSizeParameters = new Set(["width", "height"]);

export const visualTrackStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "visual", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [visualTrackModuleRef] },
    family: "visual", tone: "blue", icon: "video",
    bindings: [
      { name: "extent", referenced: extentParameters },
      { name: "clip" },
      { name: "image" },
      { name: "media" },
      { name: "surface" },
      { name: "frame", referenced: frameParameters },
      ...directClipBindings,
      { name: "treatment", recipe: { bindings: visualClipTreatmentStudioFields.bindings } },
      { name: "motion" },
    ],
    inspector: [
      ...frameParameters.filter(({ writable }) => writable === true).map(({ name }) => ({
        binding: `frame.${name}`, label: title(name), domain: "where" as const,
        page: { id: frameSizeParameters.has(name) ? "size" : "placement", label: frameSizeParameters.has(name) ? "Size" : "Placement" },
        section: { id: "frame", label: "Frame" }, control: "number" as const, number: { suffixes: ["%", "px"], step: 1 },
      })),
      ...extentParameters.map(({ name }) => ({
        binding: `extent.${name}`, label: title(name), domain: "where" as const,
        page: { id: "size", label: "Size" }, section: { id: "extent", label: "Source Extent" },
        control: "number" as const, unit: "px",
      })),
      ...directClipInspector,
      ...visualClipTreatmentStudioFields.inspector,
    ],
    requiredValues: ["program"], project: projectVisualItems,
    lane: { heightPx: 76 },
  },
];

export const visualTrackStudioParameterCompanions = [];
