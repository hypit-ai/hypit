import type { SpatialFrame } from "@hypit/spatial";
import type { Clock } from "@hypit/timeline";

/** One normalized region on the final program picture plane. */
export type NormalizedRegion = readonly [x: number, y: number, width: number, height: number];

/** One editable, author-named region sequence before it is attached to a film Timeline. */
export type RegionSequenceSeries = {
  readonly id: string;
  readonly regions: readonly (NormalizedRegion | null)[];
};

/** External spatial sequence with an explicit sampling Clock and complete frame domain. */
export type RegionSequenceDocument = {
  readonly clock: Clock;
  readonly frameCount: number;
  readonly series: readonly RegionSequenceSeries[];
};

/** A RegionSequenceDocument attached exactly to one Timeline and final Canvas. */
export type TimelineRegionSequence = {
  readonly timelineId: string;
  readonly series: readonly {
    readonly id: string;
    readonly frames: readonly (SpatialFrame | null)[];
  }[];
};
