import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { textDependency, textTypes } from "@hypit/text";

export const orcaRouterModuleRef = { name: "@hypit/orcarouter", version: "1" } as const;

export const orcaRouterTypes = {
  chatRequest: { module: orcaRouterModuleRef, name: "OrcaRouterChatRequest" },
  chat: { module: orcaRouterModuleRef, name: "OrcaRouterChatResult" },
} satisfies Record<string, TypeRef>;

export const orcaRouterCapabilities = {
  generate: { module: orcaRouterModuleRef, name: "generate" },
} satisfies Record<string, CapabilityRef>;

export const orcaRouterProducers = {
  request: { module: orcaRouterModuleRef, name: "request-orcarouter-chat" },
} satisfies Record<string, ProducerRef>;
export const orcaRouterDependency = { module: orcaRouterModuleRef } as const;

export const orcaRouterManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: orcaRouterModuleRef.name,
  version: orcaRouterModuleRef.version,
  dependencies: [artifactDependency, textDependency],
  types: [
    { name: orcaRouterTypes.chatRequest.name },
    { name: orcaRouterTypes.chat.name },
  ],
  capabilities: [{ name: orcaRouterCapabilities.generate.name, returns: orcaRouterTypes.chat }],
  producers: [{
    name: orcaRouterProducers.request.name,
    // The one sealed request: model, prompt Text and any attached image Artifacts.
    inputs: [{ name: "request", type: orcaRouterTypes.chatRequest }],
    // A Need-producing producer declares no output of its own: the fulfilled Need is its result.
    outputs: [],
    needs: [{
      name: "chat",
      capability: orcaRouterCapabilities.generate,
      returns: orcaRouterTypes.chat,
    }],
  }],
};

export const orcaRouterMarkupSurfaces = [{
  name: "generate",
  tag: "Generate",
  mode: "structured",
  // Both Records this Surface publishes: the sealed request, and the reply other Source reads.
  outputs: [orcaRouterTypes.chatRequest, orcaRouterTypes.chat],
  vocabulary: {
    summary: "Asks one OrcaRouter catalogue model a prompt, optionally with image Artifacts attached, and publishes its reply as Text.",
    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names this request so its reply can be referenced elsewhere in the Source." },
      { name: "model", kind: "literal", required: true,
        summary: "The exact OrcaRouter model ID, spelled as the catalogue returns it, including its vendor namespace." },
      { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
        summary: "Chooses the Text the model is asked about." },
    ],
    children: [{
      tag: "Reference", cardinality: "many",
      summary: "Attaches one image Artifact to the request.",
      attributes: [{
        name: "image", kind: "reference", required: true, accepts: [artifactTypes.blob],
        summary: "Selects the image Artifact this reference contributes.",
      }],
    }],
    ports: [{ name: "chat", type: orcaRouterTypes.chat,
      summary: "The reply text, addressed as `<id>.chat`." }],
    example: `<orca:Generate id="critique" model="anthropic/claude-opus-4.8" prompt={prompt}>
  <orca:Reference image={frame.image}/>
</orca:Generate>`,
    notes: [
      "The element accepts at most 8 `Reference` children and no text content.",
      "`model` is passed to the selected Endpoint unchanged; the Endpoint reports a model the account cannot call rather than substituting another one.",
      "Attached images are for models whose catalogue entry declares image input; the Endpoint refuses the request when the chosen model does not.",
      "The Surface selects no Provider and no credential — the Runtime Profile chooses the Endpoint that fulfills this capability.",
    ],
  },
}] as const;
