import { compositionDependency, compositionTypes } from "@hypit/composition";
import { htmlProgramModuleRef, htmlProgramSchema } from "@hypit/html-program";
import { audioProgramSchema, mediaOperationsModuleRef } from "@hypit/media-operations";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const htmlDocumentModuleRef = { name: "@hypit/html-document", version: "1" } as const;
export const htmlDocumentTypes = {
  document: { module: htmlDocumentModuleRef, name: "HtmlDocument" },
} satisfies Record<string, TypeRef>;
export const htmlDocumentProducers = {
  compile: { module: htmlDocumentModuleRef, name: "compile-document" },
} satisfies Record<string, ProducerRef>;
export const htmlDocumentSchema: ValueSchema = {
  kind: "object",
  fields: {
    format: { schema: { kind: "literal", value: "hypit.html-document@1" } },
    program: { schema: htmlProgramSchema },
    audio: { schema: audioProgramSchema },
    resources: { schema: { kind: "object", fields: {
      artifacts: { schema: { kind: "array", items: {
        kind: "object", fields: {
          id: { schema: { kind: "string", minLength: 1 } },
          artifact: { schema: blobRefSchema() },
        },
      } } },
      surfaces: { schema: { kind: "array", items: {
        kind: "object", fields: {
          id: { schema: { kind: "string", minLength: 1 } },
          artifact: { schema: blobRefSchema() },
        },
      } } },
    } } },
  },
};
export const htmlDocumentMarkupSurfaces = [{
  name: "document",
  tag: "Document",
  mode: "structured",
  outputs: [htmlDocumentTypes.document],
  vocabulary: {
    summary: "Produces a playable HTML document with its picture, sound and material references.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the document output." },
      { name: "composition", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the picture and sound." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the frame clock and duration." },
    ],
    ports: [{ name: "document", type: htmlDocumentTypes.document, summary: "The document, addressed as <id>.document." }],
    example: '<page:Document id="preview" composition={main.composition} timeline={animation.timeline}/>',
  },
}] as const;
export const htmlDocumentManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...htmlDocumentModuleRef,
  dependencies: [
    compositionDependency,
    timelineDependency,
    { module: htmlProgramModuleRef },
    { module: mediaOperationsModuleRef },
  ],
  types: [{ name: htmlDocumentTypes.document.name }],
  capabilities: [],
  producers: [{
    name: htmlDocumentProducers.compile.name,
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "timeline", type: timelineTypes.timeline },
    ],
    result: { kind: "output", name: "document", type: htmlDocumentTypes.document },
  }],
};
