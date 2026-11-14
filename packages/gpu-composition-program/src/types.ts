import type { PreparedPictureSampling } from "@hypit/media";
import type { LocalSpatialDomain, SpatialMap } from "@hypit/spatial/algebra";
import type { ExactTemporalValue, TemporalSamplingGrid } from "@hypit/temporal";

export type GpuCompositionSample = {
  readonly at: ExactTemporalValue;
  readonly side: "before" | "after";
  /** Output Canvas coordinates to this input's Picture coordinates. */
  readonly mapping: SpatialMap;
};

export type GpuCompositionInput = {
  readonly id: string;
  readonly source: string;
  readonly output: string;
  readonly space: LocalSpatialDomain;
  readonly picture: PreparedPictureSampling;
};

export type GpuCompositionLayer = {
  readonly id: string;
  readonly input: string;
  /** One exact observation per output frame; null means transparent. */
  readonly samples: readonly (GpuCompositionSample | null)[];
};

/** Terminal-owned finite composition value; deliberately not a public persisted protocol. */
export type GpuCompositionProgram = {
  readonly sampling: TemporalSamplingGrid;
  readonly frameCount: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clearColor: string;
    readonly space: LocalSpatialDomain;
  };
  /** Ordered bottom-to-top. */
  readonly layers: readonly GpuCompositionLayer[];
  readonly inputs: readonly GpuCompositionInput[];
};
