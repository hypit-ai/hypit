import { mediaTrackMarkupSurfaces } from "@hypit/media-track";
import type { MediaLayerProgram, MediaTrackProgram } from "@hypit/media-track";
import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEntityDraft,
  StudioInspectorFieldDeclaration,
  StudioMaterialPreview,
  StudioSourceBindingDeclaration,
} from "@hypit/studio-adapter";
import { artifactPreview, childEntities, previewLayer, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

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

const mediaTrackSurface = mediaTrackMarkupSurfaces.find((surface) => surface.name === "track");
const mediaItemAttributes = mediaTrackSurface?.vocabulary.children?.find((child) => child.tag === "Item")?.attributes ?? [];

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

placeMedia([
  "fit", "frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y", "fit-constraint",
], "where", "Fit", "Fit");
placeMedia(["stack-order"], "where", "Frame", "Stacking");
placeMedia(["clip", "radius", "padding"], "where", "Frame", "Geometry");
placeMedia(["opacity", "blur", "brightness", "contrast", "saturation"], "how", "Image", "Image");
placeMedia(["playback", "trim-start", "trim-end"], "how", "Playback", "Playback");
placeMedia(["border-width", "border-style", "border-color", "shadows", "frame-paint"], "how", "Frame", "Paint");
placeMedia(["enter", "enter-frames", "enter-easing", "enter-direction", "enter-amount", "enter-origin"], "when", "Enter", "Enter");
placeMedia(["sustain"], "when", "Sustain", "Sustain");
placeMedia(["exit", "exit-frames", "exit-easing", "exit-direction", "exit-amount", "exit-origin"], "when", "Exit", "Exit");

const mediaColorProperties = new Set(["border-color"]);
const mediaTextProperties = new Set(["padding", "shadows", "frame-paint", "sustain"]);

function mediaRecipe(name: "appearance" | "motion"): {
  readonly bindings: readonly { readonly name: string }[];
  readonly inspector: readonly StudioInspectorFieldDeclaration[];
} {
  const attribute = mediaItemAttributes.find((candidate) => candidate.name === name);
  const properties = attribute !== undefined && "recipe" in attribute ? attribute.recipe : [];
  return {
    bindings: properties.map(({ name: property }) => ({ name: property })),
    inspector: properties.map((property) => {
      const placement = mediaPlacement.get(property.name);
      if (placement === undefined) throw new Error(`Media Studio has no explicit Inspector declaration for ${property.name}.`);
      const options = valuesFor(property);
      const control = options !== undefined ? "select" as const
        : mediaColorProperties.has(property.name) ? "color" as const
        : mediaTextProperties.has(property.name) ? "text" as const : "number" as const;
      return {
        binding: `${name}.${property.name}`,
        label: title(property.name),
        ...placement,
        ...(property.summary === undefined ? {} : { summary: property.summary }),
        control,
        ...(options === undefined ? {} : { options }),
      };
    }),
  };
}

const mediaAppearanceRecipe = mediaRecipe("appearance");
const mediaMotionRecipe = mediaRecipe("motion");

function materialPreview(
  layers: readonly MediaLayerProgram[],
  facet: "visual" | "audio",
  audioFromLayer?: string,
): StudioMaterialPreview | undefined {
  const layer = layers.find((candidate) => candidate.kind === "sample"
    && (facet === "visual" || audioFromLayer === undefined || candidate.id === audioFromLayer));
  if (layer?.kind !== "sample") return undefined;
  if (facet === "audio") {
    const artifact = layer.source.kind === "timed" ? layer.source.audio?.artifact : undefined;
    return artifact === undefined ? undefined : artifactPreview("audio", artifact.digest);
  }
  if (layer.source.kind === "surface") return undefined;
  return artifactPreview(layer.source.kind === "still" ? "image" : "video", layer.source.artifact.digest);
}

function projectMedia(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as MediaTrackProgram;
  const facet = context.track.type === "AudioTrack" ? "audio" : "visual";
  const items = [
    ...program.items.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      startFrame: item.span.startFrame,
      endFrameExclusive: item.span.endFrameExclusive,
      stackOrder: item.stacking.order,
      preview: materialPreview(item.layers, facet, item.sourceAudio?.fromLayer),
      temporalInput: "window",
    })),
    ...program.sequences.map((sequence) => ({
      id: sequence.id,
      subjectId: sequence.id,
      startFrame: sequence.span.startFrame,
      endFrameExclusive: sequence.span.endFrameExclusive,
      stackOrder: sequence.stacking.order,
      preview: sequence.members[0] === undefined
        ? undefined
        : materialPreview(sequence.members[0].layers, facet, sequence.members[0].sourceAudio?.fromLayer),
      temporalInput: "terminal",
    })),
  ];
  return childEntities(context, items, "media-item", "standard")
    .map((entity, index) => {
      const item = items[index];
      if (item === undefined) return entity;
      const temporal = temporalLineageFor(context, item.id, item.temporalInput);
      return {
        ...entity,
        ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
          ? {}
          : { markerId: temporal.source.id }),
        ...(item.preview === undefined ? {} : {
          display: {
            ...entity.display,
            layers: [previewLayer(item.preview, facet === "audio" ? "waveform" : item.preview.kind === "video" ? "storyboard" : "repeat-x")],
          },
        }),
        ...(temporal === undefined ? {} : { temporal }),
      };
    });
}

const commonBindings: readonly StudioSourceBindingDeclaration[] = [
  { name: "start", writable: true },
  { name: "end", writable: true },
  { name: "for", writable: true },
  { name: "source-audio", writable: true },
  { name: "audio-gain", writable: true },
  { name: "until" },
  { name: "until-boundary", writable: true },
];

const commonInspector: readonly StudioInspectorFieldDeclaration[] = [
  {
    binding: "audio-gain", label: "Audio Gain", domain: "how",
    page: { id: "audio", label: "Audio" }, section: { id: "audio", label: "Audio" }, control: "number",
  },
  {
    binding: "until-boundary", label: "Until Boundary", domain: "when",
    page: { id: "boundary", label: "Boundary" }, section: { id: "boundary", label: "Boundary" },
    control: "select", options: ["start", "end"],
  },
];

const frameSizeParameters = new Set(["width", "height"]);

export const mediaTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "visual", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", tone: "blue", icon: "video",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    bindings: [
      ...commonBindings,
      { name: "extent", referenced: extentParameters },
      { name: "clip" },
      { name: "image" },
      { name: "media" },
      { name: "surface" },
      { name: "frame", referenced: frameParameters },
      {
        name: "appearance",
        recipe: { bindings: mediaAppearanceRecipe.bindings },
      },
      {
        name: "motion",
        recipe: { bindings: mediaMotionRecipe.bindings },
      },
    ],
    inspector: [
      ...frameParameters.filter(({ writable }) => writable === true).map(({ name }) => ({
        binding: `frame.${name}`, label: title(name), domain: "where" as const,
        page: { id: frameSizeParameters.has(name) ? "size" : "placement", label: frameSizeParameters.has(name) ? "Size" : "Placement" },
        section: { id: "frame", label: "Frame" }, control: "text" as const,
      })),
      ...extentParameters.map(({ name }) => ({
        binding: `extent.${name}`, label: title(name), domain: "where" as const,
        page: { id: "size", label: "Size" }, section: { id: "extent", label: "Source Extent" },
        control: "number" as const, unit: "px",
      })),
      ...mediaAppearanceRecipe.inspector,
      ...mediaMotionRecipe.inspector,
      ...commonInspector,
    ],
    requiredValues: ["program"], project: projectMedia,
    lane: { heightPx: 76 },
  },
  {
    id: "audio", role: "track",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media-audio", tone: "green", icon: "waveform",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    bindings: commonBindings,
    inspector: commonInspector,
    requiredValues: ["program"], project: projectMedia,
    lane: { heightPx: 48 },
  },
];
