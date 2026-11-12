import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { generationTypes } from "@hypit/generation";
import { blobTypes } from "@hypit/hypit/blob";
import type { ModuleManifest } from "@hypit/hypit/protocol";
import { samCutoutDefinition, samCutoutModuleRef, samCutoutProducers, samCutoutSurface } from "./index.js";
import { decodeSamCutoutSurface } from "./surface.js";

/** The exact-model manifest plus the alternate selector this package adds on top of it. */
const manifest: ModuleManifest = {
  ...samCutoutDefinition.manifest,
  producers: [
    ...samCutoutDefinition.manifest.producers,
    {
      name: samCutoutProducers.alternate.name,
      inputs: [{ name: "set", type: generationTypes.videoSet }],
      outputs: [{ name: "alternate", type: blobTypes.blob }],
      needs: [],
    },
  ],
};

/**
 * Reads the second entry of the GeneratedVideoSet. It throws rather than falling back to the
 * primary: an `alternate` that silently equals the primary would be a lie about the format.
 */
const alternateComponent = {
  ...samCutoutDefinition.component,
  producers: [
    ...(samCutoutDefinition.component.producers ?? []),
    {
      producer: samCutoutProducers.alternate,
      handler: ({ inputs }: { inputs: Record<string, { readonly value: unknown } | undefined> }) => {
        // The graph hands over a StoredValue; generation's own primary() unwraps it the same way.
        const stored = inputs.set?.value as { readonly kind?: string; readonly value?: unknown } | undefined;
        const set = (stored !== null && typeof stored === "object" && stored.kind === "inline"
          ? stored.value
          : stored) as { readonly videos?: readonly unknown[] } | undefined;
        const videos = set?.videos;
        if (!Array.isArray(videos) || videos.length < 2) {
          throw new Error("Generated video set has no alternate artifact; enable compatibilityCopy on the Endpoint");
        }
        return { outputs: { alternate: videos[1] }, needs: {} };
      },
    },
  ],
};

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest }],
  facets: [
    ...[alternateComponent].flatMap((component) => [
      createProducerPackageFacet(component),
      createAdmissionPackageFacet(component),
    ]),
    samCutoutDefinition.facet,
    createMarkupSurfaceFacet({
      module: samCutoutModuleRef,
      declaration: samCutoutSurface,
      handler: decodeSamCutoutSurface,
    }),
  ],
};
export default hypitPackage;
