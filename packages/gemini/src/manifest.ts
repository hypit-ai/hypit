import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { textDependency, textTypes } from "@hypit/text";

export const geminiModuleRef = { name: "@hypit/gemini", version: "1" } as const;

export const geminiModels = ["gemini-3.1-pro"] as const;
export type GeminiModel = typeof geminiModels[number];

export const geminiTypes = {
  request: { module: geminiModuleRef, name: "GeminiRequest" },
  draft: { module: geminiModuleRef, name: "GeminiRequestDraft" },
} satisfies Record<string, TypeRef>;

export const geminiCapabilities = Object.fromEntries(geminiModels.map((model) => [model, {
  module: geminiModuleRef,
  name: model,
} satisfies CapabilityRef])) as Record<GeminiModel, CapabilityRef>;

export const geminiProducers = {
  start: { module: geminiModuleRef, name: "start-request" },
  bindMedia: { module: geminiModuleRef, name: "bind-media" },
  finalize: { module: geminiModuleRef, name: "finalize-request" },
  ...Object.fromEntries(geminiModels.map((model) => [model, {
    module: geminiModuleRef,
    name: `request-${model}`,
  } satisfies ProducerRef])),
} as { readonly start: ProducerRef; readonly bindMedia: ProducerRef; readonly finalize: ProducerRef } & Record<GeminiModel, ProducerRef>;

export const geminiMarkupSurfaces = [{
  name: "generate", tag: "Generate", mode: "structured",
  outputs: [geminiTypes.draft],
  vocabulary: {
    summary: "Asks one exact Gemini model to answer a Text prompt with optional image, video or audio references.",
    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names this request and its generated Text." },
      { name: "model", kind: "literal", required: true, values: [...geminiModels],
        summary: "Selects the exact Gemini capability without choosing its Provider." },
      { name: "instruction", kind: "reference", required: true, accepts: [textTypes.text],
        summary: "Selects the system instruction Text." },
      { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
        summary: "Selects the user prompt Text." },
    ],
    children: [{ tag: "Reference", cardinality: "many",
      summary: "Attaches one image, video or audio Artifact to the request in authored order.",
      attributes: [{ name: "media", kind: "reference", required: true, accepts: [artifactTypes.blob],
        summary: "Selects the media Artifact Gemini reads." }] }],
    ports: [{ name: "text", type: textTypes.text,
      summary: "The generated answer, addressed as `<id>.text`." }],
    example: `<gemini:Generate id="describe" model="gemini-3.1-pro" instruction={instruction} prompt={prompt}>
  <gemini:Reference media={reference-video}/>
</gemini:Generate>`,
    notes: [
      "The Source declares no API key, upload URL or Provider-specific file representation.",
      "Every Reference remains a graph edge; the selected Provider decides how its Artifact bytes travel.",
    ],
  },
}] as const;

export const geminiManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: geminiModuleRef.name,
  version: geminiModuleRef.version,
  dependencies: [artifactDependency, textDependency],
  types: [{ name: geminiTypes.request.name }, { name: geminiTypes.draft.name }],
  capabilities: geminiModels.map((model) => ({ name: model, returns: textTypes.text })),
  producers: [
    {
      name: geminiProducers.start.name,
      inputs: [{ name: "instruction", type: textTypes.text }, { name: "prompt", type: textTypes.text }],
      outputs: [{ name: "draft", type: geminiTypes.draft }],
      needs: [],
    },
    {
      name: geminiProducers.bindMedia.name,
      inputs: [{ name: "draft", type: geminiTypes.draft }, { name: "media", type: artifactTypes.blob }],
      outputs: [{ name: "draft", type: geminiTypes.draft }],
      needs: [],
    },
    {
      name: geminiProducers.finalize.name,
      inputs: [{ name: "draft", type: geminiTypes.draft }],
      outputs: [{ name: "request", type: geminiTypes.request }],
      needs: [],
    },
    ...geminiModels.map((model) => ({
      name: geminiProducers[model].name,
      inputs: [{ name: "request", type: geminiTypes.request }],
      outputs: [],
      needs: [{ name: "text", capability: geminiCapabilities[model], returns: textTypes.text }],
    })),
  ],
};

export const geminiDependency = { module: geminiModuleRef } as const;
