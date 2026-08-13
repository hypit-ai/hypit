import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef } from "@narratage/protocol";

export const backgroundRemovalModuleRef = { name: "@narratage/background-removal", version: "1" } as const;
export const backgroundRemovalCapabilities = {
  remove: { module: backgroundRemovalModuleRef, name: "remove-background" },
} satisfies Record<string, CapabilityRef>;
export const backgroundRemovalProducers = {
  request: { module: backgroundRemovalModuleRef, name: "request-background-removal" },
} satisfies Record<string, ProducerRef>;
export const backgroundRemovalImplementationDigests = {
  request: digestOf("@narratage/background-removal/request@1"),
  surface: digestOf("@narratage/background-removal/background-surface@1"),
} as const;

export const backgroundRemovalMarkupSurfaces = [{
    name: "background", tag: "Background", mode: "structured", outputs: [artifactTypes.blob],
    implementation: { digest: backgroundRemovalImplementationDigests.surface },
  }] as const;


export const backgroundRemovalManifest: ModuleManifest = {
  format: "svml.module@1", name: backgroundRemovalModuleRef.name, version: backgroundRemovalModuleRef.version,
  dependencies: [artifactDependency], types: [],
  capabilities: [{ name: backgroundRemovalCapabilities.remove.name, returns: artifactTypes.blob }],
  producers: [{
    name: backgroundRemovalProducers.request.name,
    inputs: [{ name: "source", type: artifactTypes.blob }], outputs: [],
    needs: [{ name: "image", capability: backgroundRemovalCapabilities.remove, returns: artifactTypes.blob }],
    implementation: { digest: backgroundRemovalImplementationDigests.request },
  }],
};
export const backgroundRemovalManifestDigest = digestOf(backgroundRemovalManifest);
export const backgroundRemovalDependency = { module: backgroundRemovalModuleRef, digest: backgroundRemovalManifestDigest } as const;
