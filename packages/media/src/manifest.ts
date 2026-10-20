import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { compositableSurfaceSchema, fontArtifactSchema, fontStackSchema, mediaInspectionSchema, mediaStreamSelectionSchema, muxedMediaSchema, timelineVisualSchema, synchronizedMediaSchema, timelineAudioSchema } from "./schema.js";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
export const mediaModuleRef = { name: "@hypit/media", version: "1" } as const;
export const mediaTypes = {
  frameRange: { module: mediaModuleRef, name: "MediaFrameRange" },
  inspection: { module: mediaModuleRef, name: "MediaInspection" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" }, synchronized: { module: mediaModuleRef, name: "SynchronizedMedia" },
  domainSpec: { module: mediaModuleRef, name: "MediaDomainSpec" },
  timelineVisual: { module: mediaModuleRef, name: "TimelineVisual" }, timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" }, fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  fontStack: { module: mediaModuleRef, name: "FontStackRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" },
  /** Declared by `@hypit/blob`. A Type is identified by the Module that owns it, not the one that re-exports it. */
  blobArtifact: blobTypes.blob,
} satisfies Record<string, TypeRef>;
export const mediaProducers = {
  localDomain: { module: mediaModuleRef, name: "local-domain" },
} satisfies Record<string, ProducerRef>;

export const mediaMarkupSurfaces = [
    {
      name: "image", tag: "Image", mode: "structured", outputs: [blobTypes.blob],
      vocabulary: {
        summary: "Requests one authored image file from the Host and publishes it as a byte Artifact.",
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
      name: "audio", tag: "Audio", mode: "structured", outputs: [blobTypes.blob],
      vocabulary: {
        summary: "Requests one authored audio file from the Host and publishes it as a byte Artifact.",
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
      name: "video", tag: "Video", mode: "structured", outputs: [blobTypes.blob],
      vocabulary: {
        summary: "Requests one authored video file from the Host and publishes it as a byte Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Artifact Record this element publishes." },
          { name: "src", kind: "literal", required: true,
            summary: "Points at the video file, resolved by the Host against the source that declares it." },
          { name: "media-type", kind: "literal", required: false,
            summary: "States the video media type when the src extension does not name one." },
        ],
        example: `<media:Video id="reference" src="./assets/reference.mp4"/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "`.m4v`, `.mov`, `.mp4` and `.webm` name their own media type; any other file needs `media-type`.",
          "A written `media-type` must begin with `video/`, and the resolved bytes must arrive as a video Artifact.",
          "The Artifact is published under the bare `id`, and the consuming package decides what the video means.",
        ],
      },
    },
    {
      name: "font", tag: "Font", mode: "structured", outputs: [mediaTypes.fontArtifact],
      vocabulary: {
        summary: "Publishes one exact font face from one file or several Unicode-range files resolved by the Host.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the FontArtifact Record this element publishes." },
          { name: "src", kind: "literal", required: false,
            summary: "Points at a single font file. Omit it when declaring Unicode-range Source children." },
          { name: "weight", kind: "literal", required: true,
            summary: "States the exact weight the bytes carry, as a whole number from 1 to 1000." },
          { name: "style", kind: "literal", required: true, values: ["normal", "italic", "oblique"],
            summary: "States the exact style the bytes carry." },
          { name: "media-type", kind: "literal", required: false,
            summary: "States the font media type when the src extension does not name one." },
        ],
        children: [{
          tag: "Source",
          cardinality: "many",
          summary: "Contributes one file shard of the exact face when src is not used.",
          attributes: [
            { name: "src", kind: "literal", required: true,
              summary: "Points at one font file, including a Host-supported package: locator." },
            { name: "media-type", kind: "literal", required: false,
              summary: "States the font media type when the src extension does not name one." },
            { name: "unicode-range", kind: "literal", required: false,
              summary: "Limits this shard to the declared CSS Unicode range." },
          ],
        }],
        example: `<media:Font id="brand" src="./assets/Brand-Semibold.woff2" weight="600" style="normal"/>`,
        notes: [
          "Use either the src attribute or one or more Source children; mixing the two is an error.",
          "`.otf`, `.ttf`, `.woff` and `.woff2` name their own media type; any other file needs `media-type`.",
          "One element declares one face, so `weight` and `style` describe these bytes rather than a family.",
          "The FontArtifact is published under the bare `id`, and an invalid weight or style fails before any bytes are read.",
        ],
      },
    },
    {
      name: "font-stack", tag: "FontStack", mode: "structured", outputs: [mediaTypes.fontStack],
      vocabulary: {
        summary: "Orders already-authored exact font faces into one primary-plus-fallback stack.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the FontStack Record this element publishes." },
          { name: "primary", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact],
            summary: "Selects the first exact face used for glyph lookup." },
        ],
        children: [{
          tag: "Fallback",
          cardinality: "many",
          summary: "Appends one exact face to the ordered fallback chain.",
          attributes: [{ name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact],
            summary: "References an authored exact FontArtifact." }],
        }],
        example: `<media:FontStack id="caption" primary={latin}><media:Fallback font={han}/></media:FontStack>`,
      },
    },
  ] as const;

export const mediaManifest: ModuleManifest = {
  format: "hypit.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [blobDependency, temporalDependency],
  types: [
    { name: mediaTypes.frameRange.name },
    { name: mediaTypes.inspection.name },
    { name: mediaTypes.streamSelection.name },
    { name: mediaTypes.synchronized.name },
    { name: mediaTypes.domainSpec.name },
    { name: mediaTypes.timelineVisual.name },
    { name: mediaTypes.timelineAudio.name },
    { name: mediaTypes.muxed.name },
    { name: mediaTypes.fontArtifact.name }, { name: mediaTypes.fontStack.name },
    { name: mediaTypes.compositableSurface.name },
  ], capabilities: [], producers: [
    { name: mediaProducers.localDomain.name,
      inputs: [{ name: "media", type: mediaTypes.synchronized }, { name: "spec", type: mediaTypes.domainSpec }],
      result: { kind: "output" as const, name: "domain", type: temporalTypes.localDomain } },
  ],
};
export const mediaDependency = { module: mediaModuleRef } as const;
