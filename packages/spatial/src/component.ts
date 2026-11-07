import type { RefinementPackage } from "@hypit/refinement";
import type { Value } from "@hypit/protocol";
import { assertLocalSpatialDomain, assertSpatialMap } from "./algebra.js";
import type { LocalSpatialDomain, SpatialMap } from "./algebra-types.js";
import { spatialTypes } from "./manifest.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
export const spatialComponent = {
  refinements: [
    { type: spatialTypes.localDomain,
      handler: ({ value }) => assertLocalSpatialDomain(valueOf<LocalSpatialDomain>(value, "LocalSpatialDomain")) },
    { type: spatialTypes.map,
      handler: ({ value }) => assertSpatialMap(valueOf<SpatialMap>(value, "SpatialMap")) },
  ],
} satisfies { refinements: RefinementPackage };
