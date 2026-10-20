import { defineModelFields } from "@hypit/generation/model-fields";
import type {
  ModelFieldTable,
  ModelFieldValue,
  ModelFieldRequest,
} from "@hypit/generation/model-fields";
import { blobTypes } from "@hypit/hypit/blob";
import type { ResourceId } from "@hypit/hypit/protocol";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/hypit/markup";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { textTypes } from "@hypit/hypit/text";
import { validateSeedanceInputs } from "./validation.js";

export const seedanceModuleRef = { name: "@hypit/seedance", version: "1" } as const;
export const seedanceModels = ["seedance-2", "seedance-2-fast", "seedance-2-mini", "seedance-2.5"] as const;
export type SeedanceModel = typeof seedanceModels[number];

const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"] as const;

const PERSON_REFERENCE_FIELDS = [{ name: "personReference", value: { kind: "boolean" } }] as const;

const SEEDANCE_25_DURATIONS = [-1, ...Array.from({ length: 27 }, (_item, index) => index + 4)] as const;

/**
 * Exact Seedance model inputs. Provider wire names are deliberately absent:
 * Each service maps these ports independently.
 *
 * Seedance 2.5 is not treated as an alias for a Seedance 2 variant. Its public
 * request definition widens prompt/reference capacities and duration independently,
 * so it receives its own exact Capability while reusing the same three author
 * Surfaces.
 */
function seedancePortTable(model: SeedanceModel): ModelFieldTable {
  const is25 = model === "seedance-2.5";
  return defineModelFields({
    model,
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: is25 ? 30_000 : 20_000 }, minItems: 1, maxItems: 1 },
      { name: "referenceImage", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0 },
      { name: "referenceVideo", value: { kind: "media", accepts: ["video"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0 },
      { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0, maxItems: 1 },
      {
        name: "resolution",
        value: {
          kind: "enum",
          values: model === "seedance-2"
            ? ["480p", "720p", "1080p", "4k"]
            : is25 ? ["480p", "720p", "1080p"] : ["480p", "720p"],
        },
        minItems: 1,
        maxItems: 1,
      },
      { name: "aspectRatio", value: { kind: "enum", values: [...ASPECT_RATIOS] }, minItems: 1, maxItems: 1 },
      {
        name: "duration",
        value: is25
          ? { kind: "enum", values: [...SEEDANCE_25_DURATIONS] }
          : { kind: "number", integer: true, minimum: 4, maximum: 15 },
        minItems: 1,
        maxItems: 1,
      },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
      { name: "webSearch", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
    ],
    requires: [
      // First-frame, first-and-last-frame and multimodal reference are three
      // scenarios the model cannot combine.
      { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceVideo", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceAudio", "firstFrame"] },
      { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
      ...(is25 ? [] : [
        // Seedance 2 reference audio cannot travel alone; it needs a visual reference.
        { kind: "requiresAnyOf" as const, port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
      ]),
    ],
  });
}

export const seedancePorts: Readonly<Record<SeedanceModel, ModelFieldTable>> = {
  "seedance-2": seedancePortTable("seedance-2"),
  "seedance-2-fast": seedancePortTable("seedance-2-fast"),
  "seedance-2-mini": seedancePortTable("seedance-2-mini"),
  "seedance-2.5": seedancePortTable("seedance-2.5"),
};

export type SeedancePortMap = Readonly<Record<string, readonly ModelFieldValue[]>>;

export function sealSeedanceRequest(model: SeedanceModel, ports: SeedancePortMap): ModelFieldRequest {
  return seedanceEndpointsByModel[model].sealRequest(ports);
}

const seedanceBaseDefinition = defineFieldModelModule({
  module: seedanceModuleRef,
  endpoints: ([
    ["standard", "seedance-2"],
    ["fast", "seedance-2-fast"],
    ["mini", "seedance-2-mini"],
    ["v25", "seedance-2.5"],
  ] as const).map(([key, model]) => ({
    key,
    requestTypeName: model === "seedance-2.5"
      ? "Seedance25Request"
      : `${model.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}Request`,
    producerName: `request-${model}`,
    ports: seedancePorts[model],
    result: standardGenerationResults.video,
    validateInputs: validateSeedanceInputs,
  })),
});

export const seedanceEndpoints = seedanceBaseDefinition.endpoints;
export const seedanceEndpointsByModel = {
  "seedance-2": seedanceEndpoints.standard!,
  "seedance-2-fast": seedanceEndpoints.fast!,
  "seedance-2-mini": seedanceEndpoints.mini!,
  "seedance-2.5": seedanceEndpoints.v25!,
} as const;

const seedanceCommonAttributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this generation and prefixes the binding it publishes.",
  },
  {
    name: "model",
    kind: "literal",
    required: true,
    summary: "Chooses the exact Seedance variant that renders the video.",
    values: [
      "standard", "seedance-2",
      "fast", "seedance-2-fast",
      "mini", "seedance-2-mini",
      "2.5", "seedance-2.5",
    ],
  },
  {
    name: "prompt",
    kind: "reference",
    required: true,
    summary: "The Text edge describing the video the model renders.",
    accepts: [textTypes.text],
  },
  {
    name: "duration",
    kind: "literal",
    required: true,
    summary: "Sets the length of the video in whole seconds within the model's range; the author's decision, estimated beforehand with hypit estimate.",
  },
  {
    name: "resolution",
    kind: "literal",
    required: false,
    summary: "Chooses the size band the model renders at.",
    values: ["480p", "720p", "1080p", "4k"],
  },
  {
    name: "aspect-ratio",
    kind: "literal",
    required: false,
    summary: "Chooses the shape of the generated video.",
    values: [...ASPECT_RATIOS],
  },
  {
    name: "generate-audio",
    kind: "literal",
    required: false,
    summary: "Decides whether the model generates audio alongside the picture.",
    values: ["true", "false"],
  },
];

const personReferenceAttribute = (name: string, required = false): SurfaceAttributeVocabulary => ({
  name, kind: "literal", required, values: ["true", "false"],
  summary: "Required for each supplied image/video, including first/last frames: true if it contains a person, false otherwise. Audio must omit it.",
});

const seedanceVideoPort: readonly SurfacePortVocabulary[] = [{
  name: "video",
  type: blobTypes.blob,
  summary: "The first ordered member of the generated set, addressed as `<id>.video`.",
}];

const seedanceSettingNotes: readonly string[] = [
  "`resolution` defaults to `720p`, `aspect-ratio` to `9:16` and `generate-audio` to `false`.",
  "`standard` offers `1080p` and `4k`; `2.5` offers `1080p`; `fast` and `mini` render at `480p` or `720p`.",
  "`duration` is 4 to 15 seconds for `standard`, `fast` and `mini`, and `-1` for automatic or 4 to 30 seconds for `2.5`.",
];

export const seedanceMarkupSurfaces = [
  {
    name: "text-video",
    tag: "TextVideo",
    mode: "structured",
    outputs: [
      ...Object.values(seedanceEndpoints).flatMap((endpoint) => [
        endpoint.draftType,
        ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
      ]),
    ],
    vocabulary: {
      summary: "Generates one video with an exact Seedance model from a Text prompt alone.",
      attributes: [
        ...seedanceCommonAttributes,
        {
          name: "web-search",
          kind: "literal",
          required: false,
          summary: "Decides whether the model consults Web Search while generating.",
          values: ["true", "false"],
        },
      ],
      ports: seedanceVideoPort,
      example: '<seedance:TextVideo id="take-hook" model="mini" prompt={direction} duration="5" generate-audio="true"/>',
      notes: [
        ...seedanceSettingNotes,
        "This is the only invocation shape that exposes Web Search.",
        "The element accepts no children and no text content.",
      ],
    },
  },
  {
    name: "frame-video",
    tag: "FrameVideo",
    mode: "structured",
    outputs: [...Object.values(seedanceEndpoints).flatMap((endpoint) => [
      endpoint.draftType, ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
    ])],
    vocabulary: {
      summary: "Generates one video with an exact Seedance model from a Text prompt and the images the video opens and closes on.",
      attributes: [
        ...seedanceCommonAttributes,
        personReferenceAttribute("first-frame-person-reference", true),
        personReferenceAttribute("last-frame-person-reference"),
        {
          name: "first-frame",
          kind: "reference",
          required: true,
          summary: "The image Artifact the generated video opens on.",
          accepts: [blobTypes.blob],
        },
        {
          name: "last-frame",
          kind: "reference",
          required: false,
          summary: "The image Artifact the generated video closes on.",
          accepts: [blobTypes.blob],
        },
      ],
      ports: seedanceVideoPort,
      example: '<seedance:FrameVideo id="bridge" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="true" last-frame={last.image} last-frame-person-reference="false"/>',
      notes: [
        ...seedanceSettingNotes,
        "Both frames are ordinary image Artifact edges; the Surface copies no runtime media into request metadata.",
        "The element accepts no children and no text content.",
      ],
    },
  },
  {
    name: "reference-video",
    tag: "ReferenceVideo",
    mode: "structured",
    outputs: [...Object.values(seedanceEndpoints).flatMap((endpoint) => [
      endpoint.draftType, ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
    ])],
    vocabulary: {
      summary: "Generates one video with an exact Seedance model from a Text prompt and one or more image, video or audio references.",
      attributes: seedanceCommonAttributes,
      children: [{
        tag: "Reference",
        cardinality: "many",
        summary: "Attaches one Artifact as a reference through exactly one of its `image`, `video` or `audio` references.",
        attributes: [
          personReferenceAttribute("person-reference"),
          {
            name: "image",
            kind: "reference",
            required: false,
            summary: "The image Artifact this reference contributes to the generation.",
            accepts: [blobTypes.blob],
          },
          {
            name: "video",
            kind: "reference",
            required: false,
            summary: "The video Artifact this reference contributes to the generation.",
            accepts: [blobTypes.blob],
          },
          {
            name: "audio",
            kind: "reference",
            required: false,
            summary: "The audio Artifact this reference contributes to the generation.",
            accepts: [blobTypes.blob],
          },
        ],
      }],
      ports: seedanceVideoPort,
      example: `<seedance:ReferenceVideo
  id="hook-take"
  model="mini"
  prompt={hook-prompt}
  duration="8"
  resolution="720p"
  aspect-ratio="9:16"
  generate-audio="true"
>
  <seedance:Reference image={presenter-clean} person-reference="true"/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>`,
      notes: [
        ...seedanceSettingNotes,
        "The element requires at least one `Reference` child. The selected Endpoint reports any service-specific reference quota.",
        "Every image/video Reference requires `person-reference=\"true|false\"`. Classify the supplied material; audio must omit the field. The Provider transports it according to its API.",
        "A `Reference` carries exactly one of `image`, `video` or `audio`, and is empty.",
      ],
    },
  },
] as const;

/** The duration is an author literal on every Seedance Surface, so the manifest is the exact-model module's own. */
export const seedanceManifest = seedanceBaseDefinition.manifest;

export const seedanceComponent = seedanceBaseDefinition.component;
export const seedanceDefinition = seedanceBaseDefinition;

export {
  createSeedanceAssembledGenerationFragment,
  createSeedanceGenerationFragment,
} from "./fragment.js";
export {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
} from "./surface.js";
