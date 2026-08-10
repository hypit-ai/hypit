import { artifactDependency } from "@narratage/artifact";
import { speechDependency } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import { textDependency, textTypes } from "@narratage/text";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";
import {
  seedanceManifestDigest,
  seedanceModuleRef,
  seedanceEndpointsByModel,
  seedanceTypes,
} from "@narratage/seedance";
import { svsManifest, svsRecipeType } from "@narratage/svs";

export const seedanceSpeakerModuleRef = { name: "@narratage/seedance-speaker", version: "1" } as const;

export const seedanceSpeakerImplementationDigests = {
  takeSurface: digestOf("@narratage/seedance-speaker/take-surface@1"),
} as const;

export const seedanceSpeakerManifest: ModuleManifest = {
  format: "svml.module@1",
  name: seedanceSpeakerModuleRef.name,
  version: seedanceSpeakerModuleRef.version,
  dependencies: [
    artifactDependency,
    speechDependency,
    textDependency,
    { module: seedanceModuleRef, digest: seedanceManifestDigest },
    { module: svsRecipeType.module, digest: digestOf(svsManifest) },
  ],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "take",
    tag: "Take",
    mode: "structured",
    outputs: [
      textTypes.bindings,
      textTypes.binding,
      textTypes.text,
      seedanceTypes.durationProgram,
      artifactTypes.blob,
      ...Object.values(seedanceEndpointsByModel).flatMap((endpoint) =>
        Object.values(endpoint.mediaBindings).map((binding) => binding.type)),
    ],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/seedance-speaker/take-surface",
      digest: seedanceSpeakerImplementationDigests.takeSurface,
    },
  }],
  producers: [],
};

export const seedanceSpeakerManifestDigest = digestOf(seedanceSpeakerManifest);
