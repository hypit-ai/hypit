import { mediaTrackMarkupSurfaces } from "@hypit/media-track";
import type { MediaLayerProgram, MediaTrackProgram } from "@hypit/media-track";
import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEntityDraft,
  StudioMaterialPreview,
  StudioParameterDeclaration,
  StudioRecipeParameterDeclaration,
} from "@hypit/studio-adapter";
import { artifactPreview, childEntities, previewLayer, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

const frameParameters: readonly StudioParameterDeclaration[] = [
  { name: "within", label: "Within", writable: false },
  { name: "left", label: "Left", writable: true },
  { name: "top", label: "Top", writable: true },
  { name: "right", label: "Right", writable: true },
  { name: "bottom", label: "Bottom", writable: true },
  { name: "x", label: "X", writable: true },
  { name: "y", label: "Y", writable: true },
  { name: "width", label: "Width", writable: true },
  { name: "height", label: "Height", writable: true },
];

const extentParameters: readonly StudioParameterDeclaration[] = [
  { name: "width", label: "Width", control: "number", writable: true, unit: "px" },
  { name: "height", label: "Height", control: "number", writable: true, unit: "px" },
];

const mediaTrackSurface = mediaTrackMarkupSurfaces.find((surface) => surface.name === "track");
const mediaItemAttributes = mediaTrackSurface?.vocabulary.children?.find((child) => child.tag === "Item")?.attributes ?? [];

function mediaRecipe(name: "appearance" | "motion"): readonly StudioRecipeParameterDeclaration[] {
  const attribute = mediaItemAttributes.find((candidate) => candidate.name === name);
  const properties = attribute !== undefined && "recipe" in attribute ? attribute.recipe : [];
  return properties.map((property) => ({
    name: property.name,
    group: name === "motion" ? "when" : property.name === "stack-order" ? "where" : "how",
    section: name === "motion" ? "lifecycle" : property.name === "stack-order" ? "stacking" : "appearance",
  }));
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

const commonParameters: readonly StudioParameterDeclaration[] = [
  { name: "start", label: "Start", writable: true },
  { name: "end", label: "End", writable: true },
  { name: "for", label: "For", writable: true },
  { name: "source-audio", label: "Source audio", writable: true },
  { name: "audio-gain", label: "Audio gain", control: "number", writable: true },
  { name: "until", label: "Until", writable: false },
  {
    name: "until-boundary", label: "Until boundary", control: "select", writable: true,
    options: ["start", "end"],
  },
];

export const mediaTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "visual", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", tone: "blue", icon: "video",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    parameters: [
      ...commonParameters,
      { name: "extent", label: "Extent", writable: false, referenced: extentParameters },
      { name: "clip", label: "Clip", writable: false },
      { name: "image", label: "Image", writable: false },
      { name: "media", label: "Media", writable: false },
      { name: "surface", label: "Surface", writable: false },
      { name: "frame", label: "Frame", writable: false, referenced: frameParameters },
      {
        name: "appearance", label: "Appearance", writable: false,
        recipe: { parameters: mediaAppearanceRecipe },
      },
      {
        name: "motion", label: "Motion", writable: false,
        recipe: { parameters: mediaMotionRecipe },
      },
    ],
    requiredValues: ["program"], project: projectMedia,
    lane: { heightPx: 76 },
  },
  {
    id: "audio", role: "track",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media-audio", tone: "green", icon: "waveform",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    parameters: commonParameters,
    requiredValues: ["program"], project: projectMedia,
    lane: { heightPx: 48 },
  },
];
