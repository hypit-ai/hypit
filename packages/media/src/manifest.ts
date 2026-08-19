import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { compositableSurfaceSchema, fontArtifactSchema, fontStackSchema, mediaInspectionSchema, mediaStreamSelectionSchema, muxedMediaSchema, renderedVisualSchema, synchronizedMediaSchema, timelineAudioSchema } from "./schema.js";
export const mediaModuleRef = { name: "@hypit/media", version: "1" } as const;
export const mediaTypes = {
  inspection: { module: mediaModuleRef, name: "MediaInspection" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" }, synchronized: { module: mediaModuleRef, name: "SynchronizedMedia" },
  renderedVisual: { module: mediaModuleRef, name: "RenderedVisual" }, timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" }, fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  fontStack: { module: mediaModuleRef, name: "FontStackRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" }, blobArtifact: artifactTypes.blob,
} satisfies Record<string, TypeRef>;

export const mediaMarkupSurfaces = [
    {
      name: "image", tag: "Image", mode: "structured", outputs: [artifactTypes.blob],
      vocabulary: {
        summary: "Requests one authored image file from the Host and publishes it as a content-addressed Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Artifact Record this element publishes." },
          { name: "src", kind: "literal", required: true,
            summary: "Points at the image file, resolved by the Host against the source that declares it." },
          { name: "media-type", kind: "literal", required: false,
            summary: "States the image media type when the src extension does not name one." },
        ],
        example: `<media:Image id="presenter" src="./assets/presenter.png"/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "`.avif`, `.gif`, `.jpeg`, `.jpg`, `.png` and `.webp` name their own media type; any other file needs `media-type`.",
          "A written `media-type` must begin with `image/`, and the resolved bytes must arrive as an image Artifact.",
          "The Artifact is published under the bare `id`, and the consuming package decides what the image means.",
        ],
      },
    },
    {
      name: "audio", tag: "Audio", mode: "structured", outputs: [artifactTypes.blob],
      vocabulary: {
        summary: "Requests one authored audio file from the Host and publishes it as a content-addressed Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Artifact Record this element publishes." },
          { name: "src", kind: "literal", required: true,
            summary: "Points at the audio file, resolved by the Host against the source that declares it." },
          { name: "media-type", kind: "literal", required: false,
            summary: "States the audio media type when the src extension does not name one." },
        ],
        example: `<media:Audio id="music" src="./assets/music.wav"/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "`.aac`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus` and `.wav` name their own media type; any other file needs `media-type`.",
          "A written `media-type` must begin with `audio/`, and the resolved bytes must arrive as an audio Artifact.",
          "The Artifact is published under the bare `id`; declared audio is not promoted to speech here.",
        ],
      },
    },
    {
      name: "font", tag: "Font", mode: "structured", outputs: [mediaTypes.fontArtifact],
      vocabulary: {
        summary: "Requests one authored font file from the Host and publishes it with its exact weight and style as a one-source FontArtifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the FontArtifact Record this element publishes." },
          { name: "src", kind: "literal", required: true,
            summary: "Points at the font file, resolved by the Host against the source that declares it." },
          { name: "weight", kind: "literal", required: true,
            summary: "States the exact weight the bytes carry, as a whole number from 1 to 1000." },
          { name: "style", kind: "literal", required: true, values: ["normal", "italic", "oblique"],
            summary: "States the exact style the bytes carry." },
          { name: "media-type", kind: "literal", required: false,
            summary: "States the font media type when the src extension does not name one." },
        ],
        example: `<media:Font id="brand" src="./assets/Brand-Semibold.woff2" weight="600" style="normal"/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "`.otf`, `.ttf`, `.woff` and `.woff2` name their own media type; any other file needs `media-type`.",
          "One element declares one face, so `weight` and `style` describe these bytes rather than a family.",
          "The FontArtifact is published under the bare `id`, and an invalid weight or style fails before any bytes are read.",
        ],
      },
    },
  ] as const;

export const mediaManifest: ModuleManifest = {
  format: "hypit.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [artifactDependency],
  types: [
    { name: mediaTypes.inspection.name },
    { name: mediaTypes.streamSelection.name },
    { name: mediaTypes.synchronized.name },
    { name: mediaTypes.renderedVisual.name },
    { name: mediaTypes.timelineAudio.name },
    { name: mediaTypes.muxed.name },
    { name: mediaTypes.fontArtifact.name }, { name: mediaTypes.fontStack.name },
    { name: mediaTypes.compositableSurface.name },
  ], capabilities: [], producers: [],
};
export const mediaDependency = { module: mediaModuleRef } as const;
