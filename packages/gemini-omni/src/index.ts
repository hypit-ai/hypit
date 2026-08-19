import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const geminiOmniModuleRef = { name: "@hypit/gemini-omni", version: "1" } as const;

export const geminiOmniVideoPorts: GenerationPortTable = sealGenerationPortTable({
  model: "gemini-omni-video",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "enum", values: [4, 6, 8, 10] }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ["16:9", "9:16"] }, minItems: 1, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["720p", "1080p", "4k"] }, minItems: 1, maxItems: 1 },
    {
      name: "seed",
      value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 },
      minItems: 0,
      maxItems: 1,
    },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 7 },
    {
      name: "excerpts",
      value: {
        kind: "media",
        accepts: ["video"],
        itemFields: [
          { name: "startSec", value: { kind: "number", minimum: 0 } },
          { name: "endSec", value: { kind: "number", minimum: 0 } },
        ],
        itemRequires: [{ kind: "strictlyIncreasing", fields: ["startSec", "endSec"] }],
      },
      minItems: 0,
      maxItems: 1,
    },
    { name: "audioIds", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 3 },
    { name: "characterIds", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 3 },
  ],
  /** One shared reference budget; a video excerpt costs twice an image. */
  requires: [{
    kind: "weightedTotal",
    weights: { images: 1, excerpts: 2, characterIds: 1 },
    maximum: 7,
  }],
});

export function sealGeminiOmniRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(geminiOmniVideoPorts, ports);
}

const geminiOmniBaseDefinition = defineExactModelModule({
  module: geminiOmniModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "GeminiOmniVideoRequest",
    producerName: "request-gemini-omni-video",
    ports: geminiOmniVideoPorts,
  }],
});

export const geminiOmniEndpoints = geminiOmniBaseDefinition.endpoints;
export const geminiOmniComponent = geminiOmniBaseDefinition.component;
const geminiOmniEndpoint = geminiOmniEndpoints.video!;

export const geminiOmniMarkupSurfaces = [{
    name: "video",
    tag: "Video",
    mode: "structured" as const,
    outputs: [
      geminiOmniEndpoint.draftType,
      geminiOmniEndpoint.mediaBindings.images!.type,
      geminiOmniEndpoint.mediaBindings.excerpts!.type,
    ],
    vocabulary: {
      summary:
        "One Gemini Omni video generation: an exact request sealed from a written prompt and bounded references, and the video Artifact it produces.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this generation so its video can be referenced elsewhere in the Source." },
        { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
          summary: "Selects the Text the model generates from." },
        { name: "duration", kind: "literal", required: true, values: ["4", "6", "8", "10"],
          summary: "Fixes the generated video's length in seconds." },
        { name: "aspect-ratio", kind: "literal", required: true, values: ["16:9", "9:16"],
          summary: "Fixes the generated video's frame shape." },
        { name: "resolution", kind: "literal", required: true, values: ["720p", "1080p", "4k"],
          summary: "Fixes the generated video's resolution." },
        { name: "seed", kind: "literal", required: false,
          summary: "Fixes the sampling seed so the same request generates the same video." },
      ],
      children: [
        { tag: "Image", cardinality: "many",
          summary: "Attaches one image Artifact as a visual reference.",
          attributes: [
            { name: "image", kind: "reference", required: true, accepts: [artifactTypes.blob],
              summary: "Selects the image Blob this reference carries." },
          ] },
        { tag: "Excerpt", cardinality: "optional",
          summary: "Attaches one exact time range of a video Artifact as a motion reference.",
          attributes: [
            { name: "video", kind: "reference", required: true, accepts: [artifactTypes.blob],
              summary: "Selects the video Blob the range is taken from." },
            { name: "start-sec", kind: "literal", required: true,
              summary: "Fixes where the referenced range begins, in seconds from the video's start." },
            { name: "end-sec", kind: "literal", required: true,
              summary: "Fixes where the referenced range ends, in seconds from the video's start." },
          ] },
        { tag: "AudioId", cardinality: "many",
          summary: "Carries one opaque service audio identity as a scalar request value.",
          attributes: [
            { name: "value", kind: "literal", required: true,
              summary: "Fixes the audio identity the service resolves." },
          ] },
        { tag: "CharacterId", cardinality: "many",
          summary: "Carries one opaque service character identity as a scalar request value.",
          attributes: [
            { name: "value", kind: "literal", required: true,
              summary: "Fixes the character identity the service resolves." },
          ] },
      ],
      ports: [
        { name: "video", type: artifactTypes.blob,
          summary: "The generated video, selected as the primary result of the generation." },
      ],
      example: `<omni:Video id="scene" prompt={prompt} duration="8" aspect-ratio="9:16" resolution="1080p" seed="42">
  <omni:Image image={person.image}/>
  <omni:Excerpt video={reference.video} start-sec="1.5" end-sec="4"/>
  <omni:AudioId value="voice-id"/>
  <omni:CharacterId value="character-id"/>
</omni:Video>`,
      notes: [
        "Every child is written empty and carries its whole meaning in attributes.",
        "`Image` reads an image Blob and `Excerpt` a video Blob; the media type is checked when the referenced Record is known at compile time.",
        "`Excerpt` requires `start-sec` to be before `end-sec`.",
        "The element accepts at most seven `Image` children, at most one `Excerpt` child and at most three `AudioId` and three `CharacterId` children.",
        "`Image`, `Excerpt` and `CharacterId` share one reference budget of seven, in which an Excerpt costs two.",
        "The element carries no text content, and the package calls no API — the selected Runtime Endpoint fulfills the generation.",
      ],
    },
  }] as const;

export const geminiOmniManifest = {
  ...geminiOmniBaseDefinition.manifest,
};
export const geminiOmniDefinition = {
  ...geminiOmniBaseDefinition,
  manifest: geminiOmniManifest,
};
