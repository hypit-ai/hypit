import type { RefinementPackage } from "@hypit/refinement";
import type { ProducerPackage } from "@hypit/producer";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import { exactTemporalValueFromExtent, temporalExtentFromDomain } from "./extent.js";
import { assertTemporalExtent } from "./extent.js";
import { addExactTemporalValues, assertExactTemporalValue } from "./exact.js";
import { assertLocalTemporalDomain } from "./domain.js";
import {
  assertTemporalMap,
  assertTemporalMapPoint,
  assertTemporalMapPreimage,
  assertTemporalMapRegion,
  assertTemporalMapRegionSet,
  preimageTemporalMap,
  preimageTemporalMapRegions,
  temporalMapPointRegion,
  temporalMapPointRegionSet,
  uniqueTemporalMapPreimagePoint,
  uniqueTemporalMapRegionSetPoint,
} from "./map.js";
import { assertFrameSpan, assertTemporalSamplingGrid } from "./sampling.js";
import { temporalProducers, temporalTypes } from "./index.js";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalExtent, TemporalMap } from "./types.js";
import type { TemporalMapPoint, TemporalMapPreimage, TemporalMapRegion, TemporalMapRegionSet } from "./map.js";
import { assertTemporalDuration } from "./validation.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

export const temporalComponent = {
  refinements: [
    { type: temporalTypes.duration, handler: ({ value }) => assertTemporalDuration(value) },
    { type: temporalTypes.exactValue, handler: ({ value }) => assertExactTemporalValue(value as never) },
    { type: temporalTypes.extent, handler: ({ value }) => assertTemporalExtent(value as never) },
    { type: temporalTypes.frameSpan, handler: ({ value }) => assertFrameSpan(value) },
    { type: temporalTypes.samplingGrid, handler: ({ value }) => assertTemporalSamplingGrid(value as never) },
    { type: temporalTypes.map, handler: ({ value }) => assertTemporalMap(value as never) },
    { type: temporalTypes.mapPoint, handler: ({ value }) => assertTemporalMapPoint(value as never) },
    { type: temporalTypes.mapRegion, handler: ({ value }) => assertTemporalMapRegion(value as never) },
    { type: temporalTypes.mapPreimage, handler: ({ value }) => assertTemporalMapPreimage(value as never) },
    { type: temporalTypes.regionSet, handler: ({ value }) => assertTemporalMapRegionSet(value as never) },
    { type: temporalTypes.localDomain, handler: ({ value }) => assertLocalTemporalDomain(value as never) },
  ],
  producers: [
    { producer: temporalProducers.extentFromDomain, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalExtentFromDomain(valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain")),
    ) }) },
    { producer: temporalProducers.exactValueFromExtent, handler: ({ inputs }) => ({ kind: "output", value: output(
      exactTemporalValueFromExtent(valueOf<TemporalExtent>(inputs.extent?.value, "TemporalExtent")),
    ) }) },
    { producer: temporalProducers.addExactValues, handler: ({ inputs }) => ({ kind: "output", value: output(
      addExactTemporalValues(
        valueOf<ExactTemporalValue>(inputs.left?.value, "Left ExactTemporalValue"),
        valueOf<ExactTemporalValue>(inputs.right?.value, "Right ExactTemporalValue"),
      ),
    ) }) },
    { producer: temporalProducers.pointRegion, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalMapPointRegion(valueOf<TemporalMapPoint>(inputs.point?.value, "TemporalMapPoint")),
    ) }) },
    { producer: temporalProducers.preimageMap, handler: ({ inputs }) => ({ kind: "output", value: output(
      preimageTemporalMap(
        valueOf<TemporalMap>(inputs.map?.value, "TemporalMap"),
        valueOf<TemporalMapRegion>(inputs.region?.value, "TemporalMapRegion"),
      ),
    ) }) },
    { producer: temporalProducers.uniquePreimagePoint, handler: ({ inputs }) => ({ kind: "output", value: output(
      uniqueTemporalMapPreimagePoint(valueOf<TemporalMapPreimage>(inputs.preimage?.value, "TemporalMapPreimage")),
    ) }) },
    { producer: temporalProducers.pointPosition, handler: ({ inputs }) => {
      const point = valueOf<TemporalMapPoint>(inputs.point?.value, "TemporalMapPoint");
      assertTemporalMapPoint(point);
      return { kind: "output", value: output(point.position) };
    } },
    { producer: temporalProducers.pointRegionSet, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalMapPointRegionSet(
        valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain"),
        valueOf<TemporalMapPoint>(inputs.point?.value, "TemporalMapPoint"),
      ),
    ) }) },
    { producer: temporalProducers.preimageMapRegions, handler: ({ inputs }) => ({ kind: "output", value: output(
      preimageTemporalMapRegions(
        valueOf<TemporalMap>(inputs.map?.value, "TemporalMap"),
        valueOf<TemporalMapRegionSet>(inputs.regions?.value, "TemporalMapRegionSet"),
      ),
    ) }) },
    { producer: temporalProducers.uniqueRegionSetPoint, handler: ({ inputs }) => ({ kind: "output", value: output(
      uniqueTemporalMapRegionSetPoint(
        valueOf<TemporalMapRegionSet>(inputs.regions?.value, "TemporalMapRegionSet"),
      ),
    ) }) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
