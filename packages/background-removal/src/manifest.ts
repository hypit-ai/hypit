import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest, ProducerRef } from "@hypit/protocol";

export const backgroundRemovalModuleRef = { name: "@hypit/background-removal", version: "1" } as const;
export const backgroundRemovalCapabilities = {
  remove: { module: backgroundRemovalModuleRef, name: "remove-background" },
} satisfies Record<string, CapabilityRef>;
export const backgroundRemovalProducers = {
  request: { module: backgroundRemovalModuleRef, name: "request-background-removal" },
} satisfies Record<string, ProducerRef>;

export const backgroundRemovalMarkupSurfaces = [{
    name: "background", tag: "Background", mode: "structured", outputs: [artifactTypes.blob],
    vocabulary: {
      summary: "Removes the background from one image Artifact and publishes the cut-out image.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this removal so its image can be referenced elsewhere in the Source." },
        { name: "source", kind: "reference", required: true, accepts: [artifactTypes.blob],
          summary: "Chooses the image whose background is removed." },
      ],
      ports: [
        { name: "image", type: artifactTypes.blob,
          summary: "The source image with its background removed." },
      ],
      example: `<remove:Background id="cutout" source={portrait.image}/>`,
      notes: [
        "The element is empty; it accepts no children and no text.",
        "The package chooses no model, threshold or storage — the selected Endpoint fulfills the capability.",
      ],
    },
  }] as const;


export const backgroundRemovalManifest: ModuleManifest = {
  format: "hypit.module@1", name: backgroundRemovalModuleRef.name, version: backgroundRemovalModuleRef.version,
  dependencies: [artifactDependency], types: [],
  capabilities: [{ name: backgroundRemovalCapabilities.remove.name, returns: artifactTypes.blob }],
  producers: [{
    name: backgroundRemovalProducers.request.name,
    inputs: [{ name: "source", type: artifactTypes.blob }], outputs: [],
    needs: [{ name: "image", capability: backgroundRemovalCapabilities.remove, returns: artifactTypes.blob }],
  }],
};
export const backgroundRemovalDependency = { module: backgroundRemovalModuleRef } as const;
