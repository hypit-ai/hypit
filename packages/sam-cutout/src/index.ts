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
 * Object segmentation by an authored list of concepts.
 *
 * SAM returns one object id per mask record, so the service is already multi-object; what was
 * missing is a way for Hypit to ask for more than one concept and to keep every returned mask
 * addressable. This endpoint carries the whole authored list (`prompt` repeats up to
 * SAM_SEGMENT_MAX_OBJECTS times) and returns a mask video per concept, in the authored order.
 */
export const SAM_SEGMENT_MAX_OBJECTS = 8;

/**
 * One selector per ordinal. A module manifest cannot declare a producer whose behaviour depends on
 * runtime input, and the authored object list is known at compile time, so the package declares a
 * fixed selector per supported ordinal instead.
 */
export const samSegmentProducers = {
  maskAt(ordinal: number): ProducerRef {
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > SAM_SEGMENT_MAX_OBJECTS) {
      throw new Error(`SAM segment mask ordinal ${ordinal} is outside 1..${SAM_SEGMENT_MAX_OBJECTS}`);
    }
    return { module: samCutoutModuleRef, name: `select-mask-${ordinal}` };
  },
  ordinals: Array.from({ length: SAM_SEGMENT_MAX_OBJECTS }, (_unused, index) => index + 1),
};

export const samSegmentPorts = sealGenerationPortTable({
  model: "sam-3.1-segment",
  result: "video",
  ports: [
    // Two mutually exclusive ways to name objects: noun phrases (one request each) or geometry
    // (box/point prompts, which the API accepts as several objects inside one request).
    { name: "prompt", value: { kind: "text", maxChars: 2_000 }, minItems: 0, maxItems: SAM_SEGMENT_MAX_OBJECTS },
    { name: "objects", value: { kind: "text", maxChars: 2_000 }, minItems: 0, maxItems: SAM_SEGMENT_MAX_OBJECTS },
    { name: "propagation", value: { kind: "enum", values: ["both", "forward", "backward"] }, minItems: 0, maxItems: 1 },
    { name: "minConfidence", value: { kind: "number", minimum: 0, maximum: 1 }, minItems: 0, maxItems: 1 },
    { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
    { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [{ kind: "atMostOneOf", ports: ["prompt", "objects"] }],
});

export function sealSamSegmentRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationPortRequest(samSegmentPorts, ports);
}

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
  }, {
    key: "segment",
    requestTypeName: "SamSegmentRequest",
    producerName: "request-sam-segment",
    ports: samSegmentPorts,
  }],
});
export const samCutoutEndpoint = samCutoutDefinition.endpoints.cutout!;
export const samSegmentEndpoint = samCutoutDefinition.endpoints.segment!;

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

/**
 * Segmentation Surface: one named mask Artifact per authored object.
 *
 * The object list is authored, so it is known at compile time and every mask gets its own output
 * binding (`person`, `ball`, …). That is what makes a mask addressable in the graph instead of a
 * single clip that happens to contain several objects.
 */
export const samSegmentSurface = {
  name: "segment", tag: "Segment", mode: "structured" as const,
  outputs: [samSegmentEndpoint.draftType, samSegmentEndpoint.mediaBindings.source!.type],
  vocabulary: {
    summary: "Tracks one or more named objects through a clip and returns one mask Artifact per object.",
    attributes: [
      { name: "id", kind: "identifier" as const, required: true, summary: "Names the segmentation component." },
      { name: "prompt", kind: "literal" as const, required: true,
        summary: "Short noun phrase naming the first object to segment, e.g. \"person\"." },
      { name: "also", kind: "literal" as const, required: false,
        summary: `Comma-separated further objects, e.g. "ball, referee". Together with prompt at most ${SAM_SEGMENT_MAX_OBJECTS} objects.` },
      { name: "source", kind: "reference" as const, required: true, accepts: [blobTypes.blob],
        summary: "The source video Artifact to segment." },
      { name: "format", kind: "literal" as const, required: false, values: ["WEBM", "MOV"],
        summary: "Transparent container for every mask Artifact; WEBM is the default." },
      { name: "propagation", kind: "literal" as const, required: false, values: ["both", "forward", "backward"],
        summary: "Which frames the service tracks over. \"backward\" needs a box or point anchored on a frame after the first." },
      { name: "min-confidence", kind: "literal" as const, required: false,
        summary: "Drop mask records the service reports below this confidence, 0 to 1. Only meaningful when the service reports confidence at all." },
    ],
    children: [{
      tag: "Object",
      cardinality: "many" as const,
      summary: "One object named by geometry instead of a noun phrase. Use Objects or prompt/also, never both in one element.",
      attributes: [
        { name: "name", kind: "identifier" as const, required: true,
          summary: "Names the object; becomes its output binding after slugging." },
        { name: "frame", kind: "literal" as const, required: false,
          summary: "Source frame the box or points are drawn on, 0-based. Defaults to 0." },
        { name: "box", kind: "literal" as const, required: false,
          summary: "x1,y1,x2,y2 normalised to 0..1 of the source frame. Names the whole object." },
        { name: "points", kind: "literal" as const, required: false,
          summary: "Semicolon-separated x,y pairs, optional trailing \"neg\" for a negative point, e.g. \"0.5,0.5; 0.3,0.6,neg\"." },
      ],
    }],
    example: '<sam:Segment id="tracked" prompt="person" also="ball" propagation="both" source={shot}/>',
    notes: [
      "Each object becomes its own output binding, named after a lowercased slug of the concept or Object name (\"yellow school bus\" -> yellow-school-bus).",
      "Two request forms: prompt/also sends one noun phrase per request; Object children with box or points are geometry prompts, which the service accepts as several objects in one request. The API rejects a request that mixes them.",
      "Concepts are matched zero-shot; the Endpoint is expected to return mask set entries in the authored order, which is what makes the nth output the nth object.",
      "propagation=\"backward\" is only valid with a geometry Object whose frame is after the first; the service rejects it otherwise.",
      "A concept or box that matches nothing fails the request rather than returning an empty mask.",
      "At most 8 objects: the output map is static, so the count must be known at compile time.",
    ],
  },
};
