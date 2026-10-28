import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import type { ModuleManifest, ValueSchema } from "@hypit/hypit/protocol";

import { imageTransformOperationSchema } from "./operation-schema.js";
import {
  imageComposeProducers,
  imageComposeTypes,
  imageOperationsCapabilities,
  imageOperationsModuleRef,
  imageTransformProducers,
  imageTransformTypes,
} from "./refs.js";

export {
  imageComposeProducers,
  imageComposeTypes,
  imageOperationsCapabilities,
  imageOperationsDependency,
  imageOperationsModuleRef,
  imageTransformProducers,
  imageTransformTypes,
} from "./refs.js";

export const imageTransformProgramSchema: ValueSchema = { kind: "object", fields: {
  operations: { schema: { kind: "array", minItems: 1, items: imageTransformOperationSchema } },
} };


export const imageOperationsManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: imageOperationsModuleRef.name,
  version: imageOperationsModuleRef.version,
  dependencies: [blobDependency, spatialDependency],
  types: [
    imageTransformTypes.program.name,
    imageComposeTypes.options.name,
    imageComposeTypes.layerSpec.name,
    imageComposeTypes.layerSet.name,
  ],
  capabilities: [
    { name: imageOperationsCapabilities.transform.name, returns: blobTypes.blob },
    { name: imageOperationsCapabilities.compose.name, returns: blobTypes.blob },
  ],
  producers: [
    {
      name: imageTransformProducers.request.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "program", type: imageTransformTypes.program },
      ],
      result: { kind: "need" as const, name: "image", capability: imageOperationsCapabilities.transform },
    },
    {
      name: imageComposeProducers.createLayers.name,
      inputs: [], result: { kind: "output" as const, name: "layers", type: imageComposeTypes.layerSet },
    },
    {
      name: imageComposeProducers.appendLayer.name,
      inputs: [
        { name: "layers", type: imageComposeTypes.layerSet },
        { name: "source", type: blobTypes.blob },
        { name: "frame", type: spatialTypes.frame },
        { name: "spec", type: imageComposeTypes.layerSpec },
      ],
      result: { kind: "output" as const, name: "layers", type: imageComposeTypes.layerSet },
    },
    {
      name: imageComposeProducers.request.name,
      inputs: [
        { name: "canvas", type: spatialTypes.canvas },
        { name: "options", type: imageComposeTypes.options },
        { name: "layers", type: imageComposeTypes.layerSet },
      ],
      result: { kind: "need" as const, name: "image", capability: imageOperationsCapabilities.compose },
    },
  ],
};
