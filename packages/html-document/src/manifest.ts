import { htmlProgramModuleRef, htmlProgramSchema, htmlProgramTypes } from "@hypit/html-program";
import { audioProgramModuleRef, audioProgramSchema, audioProgramTypes } from "@hypit/audio-program";
import type { ValueSchema } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const htmlDocumentModuleRef = { name: "@hypit/html-document" } as const;
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
  },
};
export const htmlDocumentManifest: GenerationModuleDefinition = {
  ...htmlDocumentModuleRef,
  dependencies: [
    htmlProgramModuleRef,
    audioProgramModuleRef,
  ],
  types: [htmlDocumentTypes.document.name],
  capabilities: [],
  producers: [{
    name: htmlDocumentProducers.compile.name,
    inputs: [
      { name: "program", type: htmlProgramTypes.program },
      { name: "audio", type: audioProgramTypes.program },
    ],
    result: { kind: "output", name: "document", type: htmlDocumentTypes.document },
  }],
};
