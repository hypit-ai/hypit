import { artifactDependency } from "@narratage/artifact";
import { narrativeDependency } from "@narratage/narrative";
import { speechDependency } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import {
  promptKitManifestDigest,
  promptKitModuleRef,
  promptKitTypes,
} from "@narratage/prompt-kit";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";
import {
  seedanceManifestDigest,
  seedanceModuleRef,
  seedanceTypes,
} from "@narratage/seedance";
import { svsManifest, svsRecipeType } from "@narratage/svs";

export const seedanceSpeakerModuleRef = { name: "@narratage/seedance-speaker", version: "0.0.0-dev" } as const;

export const seedanceSpeakerImplementationDigests = {
  takeSurface: digestOf("@narratage/seedance-speaker/take-surface@3"),
} as const;

export const seedanceSpeakerManifest: ModuleManifest = {
  format: "svml.module@1",
  name: seedanceSpeakerModuleRef.name,
  version: seedanceSpeakerModuleRef.version,
  dependencies: [
    artifactDependency,
    narrativeDependency,
    speechDependency,
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
    outputs: [promptKitTypes.program, seedanceTypes.speechSpine, artifactTypes.blob],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/seedance-speaker/take-surface",
      digest: seedanceSpeakerImplementationDigests.takeSurface,
    },
  }],
  producers: [],
};

export const seedanceSpeakerManifestDigest = digestOf(seedanceSpeakerManifest);
