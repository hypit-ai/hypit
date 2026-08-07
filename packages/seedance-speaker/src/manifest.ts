import { artifactDependency, artifactTypes } from "@svml/artifact";
import {
  videoContractDependencies,
} from "@svml/contracts";
import {
  promptKitManifestDigest,
  promptKitModuleRef,
  promptKitTypes,
} from "@svml/prompt-kit";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest } from "@svml/protocol";
import {
  seedanceManifestDigest,
  seedanceModuleRef,
  seedanceTypes,
} from "@svml/seedance";
import { svsManifest, svsRecipeType } from "@svml/svs";

export const seedanceSpeakerModuleRef = { name: "@svml/seedance-speaker", version: "0.0.0-dev" } as const;

export const seedanceSpeakerImplementationDigests = {
  takeSurface: digestOf("@svml/seedance-speaker/take-surface@3"),
} as const;

export const seedanceSpeakerManifest: ModuleManifest = {
  format: "svml.module@1",
  name: seedanceSpeakerModuleRef.name,
  version: seedanceSpeakerModuleRef.version,
  dependencies: [
    artifactDependency,
    videoContractDependencies.narrative,
    videoContractDependencies.speech,
    { module: promptKitModuleRef, digest: promptKitManifestDigest },
    { module: seedanceModuleRef, digest: seedanceManifestDigest },
    { module: svsRecipeType.module, digest: digestOf(svsManifest) },
  ],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "take",
    tag: "Take",
    mode: "structured",
    outputs: [promptKitTypes.program, seedanceTypes.speechProgram, artifactTypes.blob],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/seedance-speaker/take-surface",
      digest: seedanceSpeakerImplementationDigests.takeSurface,
    },
  }],
  producers: [],
};

export const seedanceSpeakerManifestDigest = digestOf(seedanceSpeakerManifest);
