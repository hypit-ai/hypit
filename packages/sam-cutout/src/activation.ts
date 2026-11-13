import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { generationTypes } from "@hypit/generation";
import { blobTypes } from "@hypit/hypit/blob";
import type { ModuleManifest } from "@hypit/hypit/protocol";
import {
  samCutoutDefinition,
  samCutoutModuleRef,
  samCutoutProducers,
  samCutoutSurface,
  samSegmentProducers,
  samSegmentSurface,
} from "./index.js";
import { decodeSamCutoutSurface } from "./surface.js";
import { decodeSamSegmentSurface } from "./segment-surface.js";

/**
 * Unwrap a StoredValue holding a GeneratedVideoSet. The graph hands over the stored wrapper;
 * generation's own primary() unwraps it the same way.
 */
function videosOf(stored: unknown): readonly unknown[] {
  const value = stored as { readonly kind?: string; readonly value?: unknown } | undefined;
  const set = (value !== null && typeof value === "object" && value.kind === "inline"
    ? value.value
    : value) as { readonly videos?: readonly unknown[] } | undefined;
  return Array.isArray(set?.videos) ? set.videos : [];
}

/** The exact-model manifest plus the selectors this package adds on top of it. */
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
    // One selector per supported object ordinal. The mask set carries one video per authored
    // concept, in authored order, so ordinal selection is what gives each object its own Artifact.
    ...samSegmentProducers.ordinals.map((ordinal) => ({
      name: samSegmentProducers.maskAt(ordinal).name,
      inputs: [{ name: "set", type: generationTypes.videoSet }],
      outputs: [{ name: "mask", type: blobTypes.blob }],
      needs: [],
    })),
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
        const videos = videosOf(inputs.set?.value);
        if (videos.length < 2) {
          throw new Error("Generated video set has no alternate artifact; enable compatibilityCopy on the Endpoint");
        }
        return { outputs: { alternate: videos[1] }, needs: {} };
      },
    },
    ...samSegmentProducers.ordinals.map((ordinal) => ({
      producer: samSegmentProducers.maskAt(ordinal),
      handler: ({ inputs }: { inputs: Record<string, { readonly value: unknown } | undefined> }) => {
        const videos = videosOf(inputs.set?.value);
        const mask = videos[ordinal - 1];
        if (mask === undefined) {
          throw new Error(`SAM segment returned ${videos.length} mask video(s); object ${ordinal} is missing`);
        }
        return { outputs: { mask }, needs: {} };
      },
    })),
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
    createMarkupSurfaceFacet({
      module: samCutoutModuleRef,
      declaration: samSegmentSurface,
      handler: decodeSamSegmentSurface,
    }),
  ],
};
export default hypitPackage;
