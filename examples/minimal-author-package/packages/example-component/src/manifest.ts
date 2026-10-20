import { readFile } from "node:fs/promises";
import { compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { timelineTypes } from "@hypit/timeline";
import { temporalTypes } from "@hypit/temporal";
import { mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/hypit/recipe";
import { blobTypes } from "@hypit/hypit/blob";
import { spatialTypes } from "@hypit/spatial";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const exampleModuleRef = { name: "@example/example-component", version: "1" } as const;
export const exampleTypes = {
  box: { module: exampleModuleRef, name: "ExampleBox" },
  text: { module: exampleModuleRef, name: "ExampleText" },
  imageSlot: { module: exampleModuleRef, name: "ExampleImageSlot" },
  style: { module: exampleModuleRef, name: "ExampleStyle" },
  itemSet: { module: exampleModuleRef, name: "ExampleItemSet" },
} satisfies Record<string, TypeRef>;
export const exampleProducers = {
  renderBox: { module: exampleModuleRef, name: "render-example-box" },
  renderText: { module: exampleModuleRef, name: "render-example-text" },
  renderImage: { module: exampleModuleRef, name: "render-example-image-slot" },
  appendItems: { module: exampleModuleRef, name: "append-example-items" },
} satisfies Record<string, ProducerRef>;

export const exampleManifest: ModuleManifest = {
  format: "hypit.module@1", name: exampleModuleRef.name, version: exampleModuleRef.version,
  dependencies: [
    { module: blobTypes.blob.module },
    { module: compositionTypes.visualTrack.module },
    { module: mediaTypes.fontStack.module },
    { module: spatialTypes.frame.module },
    { module: timelineTypes.timeline.module },
    { module: recipeType.module },
    { module: temporalTypes.window.module },
  ],
  types: Object.values(exampleTypes).map(({ name }) => ({ name })),
  capabilities: [],
  producers: Object.values(exampleProducers).map((producer) => ({
    name: producer.name,
    inputs: producer === exampleProducers.appendItems
      ? [{ name: "previous", type: exampleTypes.itemSet }, { name: "item", type: exampleTypes.itemSet }]
      : [{ name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
        ...(producer === exampleProducers.renderImage ? [{ name: "image", type: blobTypes.blob }] : [])],
    result: producer === exampleProducers.appendItems
      ? { kind: "output", name: "set", type: exampleTypes.itemSet }
      : { kind: "output", name: "visual", type: compositionTypes.visualTrack },
  })),
};

const vocabulary = (summary: string, example: string) => ({
  summary,
  appearance: "A deterministic, self-contained example surface rendered on the supplied Timeline.",
  preview: previewImage("Box.png"),
  attributes: [
    { name: "id", kind: "identifier" as const, required: true, summary: "Names this instance." },
    { name: "timeline", kind: "reference" as const, required: true, accepts: [timelineTypes.timeline], summary: "Selects the complete Timeline." },
    { name: "within", kind: "reference" as const, required: true, accepts: [spatialTypes.frame], summary: "Places the complete surface in this picture-plane Frame." },
  ],
  ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The terminal visual contribution." }],
  example,
  notes: ["The same shape is used for box, text and image-slot surfaces; only the terminal Producer changes."],
});

export const exampleMarkupSurfaces = [
  { name: "box", tag: "Box", mode: "structured", outputs: [exampleTypes.box, compositionTypes.visualTrack], vocabulary: { ...vocabulary("A framed box surface.", "<example:Box id=\"box\" timeline={speech.timeline} within={layout.card}/>") , preview: previewImage("Box.png") } },
  { name: "text", tag: "Text", mode: "structured", outputs: [exampleTypes.text, compositionTypes.visualTrack], vocabulary: { ...vocabulary("A text-bearing surface.", "<example:Text id=\"title\" timeline={speech.timeline} within={layout.title} during={speech.window}>Hello</example:Text>"), preview: previewImage("Box.png") } },
  { name: "image-slot", tag: "ImageSlot", mode: "structured", outputs: [exampleTypes.imageSlot, compositionTypes.visualTrack], vocabulary: { ...vocabulary("An image slot whose content is a graph input.", "<example:ImageSlot id=\"shot\" timeline={speech.timeline} within={layout.shot} image={shot-image}/>") , attributes: [...vocabulary("", "").attributes, { name: "image", kind: "reference" as const, required: false, accepts: [blobTypes.blob], summary: "Optional image Blob Artifact." }], preview: previewImage("Box.png") } },
  { name: "style", tag: "Style", mode: "structured", outputs: [exampleTypes.style], vocabulary: {
    summary: "Decodes one SVS Recipe and exact FontStackRef into a Style value.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Style." },
      { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "The decoded recipe with path and properties." },
      { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack], summary: "An exact FontStackRef." },
    ], example: "<example:Style id=\"card\" recipe={recipes.card} font={caption-font}/>",
  } },
] as const;
