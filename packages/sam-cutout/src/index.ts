import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortValue } from "@hypit/generation";
import { defineExactModelModule } from "@hypit/generation/model";
import type { ProducerRef } from "@hypit/hypit/protocol";

export const samCutoutModuleRef = { name: "@hypit/sam-cutout", version: "1" } as const;

export const samCutoutProducers = {
  alternate: { module: samCutoutModuleRef, name: "select-alternate-video" },
} satisfies Record<string, ProducerRef>;

/**
 * Cutout video by an authored concept.
 *
 * Differs from `@hypit/volcengine-matting@1#matte-portrait-video` in exactly one thing that matters:
 * the concept is a port, so an author chooses it per request instead of the Endpoint choosing it for
 * every request. Segmentation masks become the frame's alpha channel.
 */
export const samCutoutPorts = sealGenerationPortTable({
  model: "sam-3.1-cutout",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 2_000 }, minItems: 1, maxItems: 1 },
    { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
    { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
});

export function sealSamCutoutRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationPortRequest(samCutoutPorts, ports);
}

export const samCutoutDefinition = defineExactModelModule({
  module: samCutoutModuleRef,
  endpoints: [{
    key: "cutout",
    requestTypeName: "SamCutoutRequest",
    producerName: "request-sam-cutout",
    ports: samCutoutPorts,
  }],
});
export const samCutoutEndpoint = samCutoutDefinition.endpoints.cutout!;

export const samCutoutSurface = {
  name: "cutout", tag: "Cutout", mode: "structured" as const,
  outputs: [samCutoutEndpoint.draftType, samCutoutEndpoint.mediaBindings.source!.type],
  vocabulary: {
    summary: "Cuts one named concept out of a clip with Segment Anything, keeping every frame's alpha.",
    attributes: [
      { name: "id", kind: "identifier" as const, required: true, summary: "Names the cutout video." },
      { name: "prompt", kind: "literal" as const, required: true,
        summary: "Short noun phrase naming the object to keep, e.g. \"person\" or \"yellow school bus\". One concept per element." },
      { name: "source", kind: "reference" as const, required: true, accepts: [blobTypes.blob],
        summary: "The source video Artifact whose matching object survives." },
      { name: "format", kind: "literal" as const, required: false, values: ["WEBM", "MOV"],
        summary: "Transparent container; WEBM is the default, MOV (ProRes 4444) is for readers without WebM alpha." },
    ],
    ports: [
      { name: "video", type: blobTypes.blob, summary: "The transparent video Artifact, before normalization." },
      { name: "alternate", type: blobTypes.blob,
        summary: "The compatibility copy the Endpoint encoded alongside it (MOV when compatibilityCopy is on). Targeting it is what stores it." },
    ],
    example: '<sam:Cutout id="subject" prompt="person" source={shot} format="WEBM"/>',
    notes: [
      "The concept is matched with zero-shot detection; a phrase that matches nothing fails the request rather than returning an empty clip.",
      "Object identity is preserved across frames by the service, and a frame that carries no fresh mask reuses the previous one.",
      "The element is empty; it accepts no children or text.",
      "Importing this package is what selects the SAM model family; the Runtime separately binds this Need to an Endpoint.",
    ],
  },
};
