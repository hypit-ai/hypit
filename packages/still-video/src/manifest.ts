import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { frameSpanSchema, temporalDependency, temporalTypes } from "@hypit/temporal";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const stillVideoModuleRef = { name: "@hypit/still-video", version: "1" } as const;
export const stillVideoTypes = {
  request: { module: stillVideoModuleRef, name: "StillVideoRequest" },
  layout: { module: stillVideoModuleRef, name: "StillVideoLayout" },
} satisfies Record<string, TypeRef>;
export const stillVideoCapabilities = {
  render: { module: stillVideoModuleRef, name: "render-still-video" },
} satisfies Record<string, CapabilityRef>;
export const stillVideoProducers = {
  plan: { module: stillVideoModuleRef, name: "plan-still-video" },
  bind: { module: stillVideoModuleRef, name: "bind-still-video-source" },
  render: { module: stillVideoModuleRef, name: "request-still-video" },
} satisfies Record<string, ProducerRef>;

export const stillVideoRequestSchema: ValueSchema = { kind: "object", fields: {
  frameRate: { schema: { kind: "object", fields: {
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  } } },
  frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  segments: { schema: { kind: "array", items: { kind: "object", fields: {
    ...(frameSpanSchema.kind === "object" ? frameSpanSchema.fields : {}),
    source: { optional: true, schema: blobRefSchema() },
  } } } },
} };
export const stillVideoLayoutSchema: ValueSchema = { kind: "object", fields: {
  weights: { schema: { kind: "array", minItems: 1, items: { kind: "number", minimum: Number.MIN_VALUE } } },
} };

export const stillVideoManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: stillVideoModuleRef.name,
  version: stillVideoModuleRef.version,
  dependencies: [blobDependency, temporalDependency],
  types: Object.values(stillVideoTypes).map((type) => type.name),
  capabilities: [{ name: stillVideoCapabilities.render.name, returns: blobTypes.blob }],
  producers: [{
    name: stillVideoProducers.plan.name,
    inputs: [
      { name: "duration", type: temporalTypes.duration },
      { name: "sampling", type: temporalTypes.samplingGrid },
      { name: "layout", type: stillVideoTypes.layout },
    ],
    result: { kind: "output", name: "request", type: stillVideoTypes.request },
  }, {
    name: stillVideoProducers.bind.name,
    inputs: [
      { name: "request", type: stillVideoTypes.request },
      { name: "source", type: blobTypes.blob },
    ],
    result: { kind: "output", name: "request", type: stillVideoTypes.request },
  }, {
    name: stillVideoProducers.render.name,
    inputs: [{ name: "request", type: stillVideoTypes.request }],
    result: { kind: "need", name: "video", capability: stillVideoCapabilities.render },
  }],
};
