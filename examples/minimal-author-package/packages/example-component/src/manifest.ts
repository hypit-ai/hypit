import { readFile } from "node:fs/promises";
import { compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { temporalTypes } from "@hypit/temporal";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const exampleModuleRef = { name: "@example/example-component", version: "1" } as const;
export const exampleTypes = {
  box: { module: exampleModuleRef, name: "ExampleBox" },
  text: { module: exampleModuleRef, name: "ExampleText" },
  mediaSlot: { module: exampleModuleRef, name: "ExampleMediaSlot" },
} satisfies Record<string, TypeRef>;
export const exampleProducers = {
  renderBox: { module: exampleModuleRef, name: "render-example-box" },
  renderText: { module: exampleModuleRef, name: "render-example-text" },
  renderMedia: { module: exampleModuleRef, name: "render-example-media-slot" },
} satisfies Record<string, ProducerRef>;

export const exampleManifest: ModuleManifest = {
  format: "hypit.module@1", name: exampleModuleRef.name, version: exampleModuleRef.version,
  dependencies: [
    { module: compositionTypes.visualTrack.module },
    { module: programSpaceTypes.programSpace.module },
    { module: semanticTrackTypes.track.module },
    { module: temporalTypes.window.module },
  ],
  types: Object.values(exampleTypes).map(({ name }) => ({ name })),
  capabilities: [],
  producers: Object.values(exampleProducers).map((producer) => ({
    name: producer.name,
    inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
    outputs: [{ name: "track", type: compositionTypes.visualTrack }],
    needs: [],
  })),
};

const vocabulary = (summary: string, example: string) => ({
  summary,
  appearance: "A deterministic, self-contained example surface rendered on the supplied ProgramSpace.",
  preview: previewImage("Box.png"),
  attributes: [
    { name: "id", kind: "identifier" as const, required: true, summary: "Names this instance." },
    { name: "semantic", kind: "reference" as const, required: true, accepts: [semanticTrackTypes.track], summary: "Selects the semantic timing track." },
  ],
  ports: [{ name: "track", type: compositionTypes.visualTrack, summary: "The terminal VisualTrack." }],
  example,
  notes: ["The same shape is used for box, text and media-slot surfaces; only the terminal Producer changes."],
});

export const exampleMarkupSurfaces = [
  { name: "box", tag: "Box", mode: "structured", outputs: [exampleTypes.box, compositionTypes.visualTrack], vocabulary: { ...vocabulary("A framed box surface.", "<example:Box id=\"box\" semantic={speech.semantic}/>") , preview: previewImage("Box.png") } },
  { name: "text", tag: "Text", mode: "structured", outputs: [exampleTypes.text, temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window, compositionTypes.visualTrack], vocabulary: { ...vocabulary("A text-bearing surface.", "<example:Text id=\"title\" semantic={speech.semantic}>Hello</example:Text>"), preview: previewImage("Box.png") } },
  { name: "media-slot", tag: "MediaSlot", mode: "structured", outputs: [exampleTypes.mediaSlot, compositionTypes.visualTrack], vocabulary: { ...vocabulary("A media slot whose content is a graph input.", "<example:MediaSlot id=\"shot\" semantic={speech.semantic}/>") , preview: previewImage("Box.png") } },
] as const;
