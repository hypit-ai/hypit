import { mediaDependency, mediaTypes } from "@narratage/media";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";

export const fontsOpenModuleRef = { name: "@narratage/fonts-open", version: "0.0.0-dev" } as const;

export const fontsOpenFaceSurfaceImplementationDigest = digestOf(
  "@narratage/fonts-open/pinned-open-face-surface@1",
);
export const fontsOpenStackSurfaceImplementationDigest = digestOf(
  "@narratage/fonts-open/pinned-open-exact-stack-surface@1",
);

export const fontsOpenManifest: ModuleManifest = {
  format: "svml.module@1",
  name: fontsOpenModuleRef.name,
  version: fontsOpenModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "face",
    tag: "Face",
    mode: "structured",
    outputs: [mediaTypes.fontArtifact],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/fonts-open/face-surface",
      digest: fontsOpenFaceSurfaceImplementationDigest,
    },
  }, {
    name: "stack",
    tag: "Stack",
    mode: "structured",
    outputs: [mediaTypes.fontStack],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/fonts-open/stack-surface",
      digest: fontsOpenStackSurfaceImplementationDigest,
    },
  }],
  producers: [],
};

export const fontsOpenManifestDigest = digestOf(fontsOpenManifest);
