import type { RefinementPackage } from "@hypit/refinement";
import {
  assertExactTemporalValue,
  assertFrameSpan,
  assertLocalTemporalDomain,
  assertTemporalDuration,
  assertTemporalExtent,
  assertTemporalMap,
  assertTemporalMapPoint,
  assertTemporalMapPreimage,
  assertTemporalMapRegion,
  assertTemporalMapRegionSet,
  assertTemporalSamplingGrid,
} from "@hypit/temporal";

import { temporalTypes } from "./manifest.js";

export const temporalRefinements = [
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
] satisfies RefinementPackage;
