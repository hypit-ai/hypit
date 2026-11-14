import type { AudiovisualProgram } from "@hypit/audiovisual";
import type { LocalSpatialDomain, SpatialRegion } from "@hypit/spatial/algebra";
import type {
  ExactTemporalValue,
  TemporalMapPoint,
  TemporalMapRegionSet,
  TemporalRange,
} from "@hypit/temporal/algebra";

export type AudiovisualSignal = "picture" | "audio";

export type AudiovisualOutputDemand = {
  readonly picture?: {
    readonly range: TemporalRange;
    /** Omitted means the complete Programme Picture domain. */
    readonly region?: SpatialRegion;
    /** Exact output observations to project into Source-local time. */
    readonly samples?: readonly TemporalMapPoint[];
  };
  readonly audio?: { readonly range: TemporalRange };
};

export type AudiovisualPictureDemand = NonNullable<AudiovisualOutputDemand["picture"]>;

export type ExecutionNodeDemand = {
  readonly id: string;
  readonly signal: AudiovisualSignal;
  readonly node: string;
  readonly operation: string;
  readonly dependencies: readonly string[];
  readonly temporal: TemporalMapRegionSet;
  /** Complete Picture domain produced by this node, independent of demanded ROI. */
  readonly pictureDomain?: LocalSpatialDomain;
  readonly spatial?: SpatialRegion;
};

/**
 * One Programme-local use of a Source execution task.
 *
 * The Programme demand and occurrence identity stay here. `sourceTemporal`
 * and `sourceSpatial` are the exact Source-local image of this particular
 * use; they are aggregated into the referenced task without making the task
 * itself occurrence-owned.
 */
export type SourceUseDemand = {
  readonly id: string;
  readonly program: string;
  /** Programme graph node for this use. */
  readonly node: string;
  readonly signal: AudiovisualSignal;
  readonly occurrence: string;
  /** Nominal ProgramSource output consumed by this occurrence-local use. */
  readonly source: string;
  readonly output: string;
  /** Source task or recursively expanded Programme output that implements this use. */
  readonly producer: string;
  readonly programmeTemporal: TemporalMapRegionSet;
  readonly sourceTemporal:
    | { readonly kind: "constant" }
    | { readonly kind: "signal"; readonly regions: TemporalMapRegionSet };
  readonly sourceSpatial?: SpatialRegion;
  /** Output observations that reach this use through pointwise Picture paths. */
  readonly sourceSamples?: readonly TemporalMapPoint[];
};

/**
 * Source-local work shared by every demanded Programme use of the same
 * Source output. It deliberately contains no occurrence, placement or
 * Programme-local time.
 */
export type SourceExecutionTaskDemand = {
  readonly id: string;
  readonly program: string;
  readonly signal: AudiovisualSignal;
  readonly source: string;
  readonly output: string;
  readonly uses: readonly string[];
  readonly temporal: SourceUseDemand["sourceTemporal"];
  readonly pictureDomain?: LocalSpatialDomain;
  readonly spatial?: SpatialRegion;
  readonly samples?: readonly TemporalMapPoint[];
};

export type AudiovisualDemandPlan = {
  readonly program: string;
  readonly nodes: readonly ExecutionNodeDemand[];
  readonly uses: readonly SourceUseDemand[];
  readonly sourceTasks: readonly SourceExecutionTaskDemand[];
  readonly outputs: Readonly<Partial<Record<AudiovisualSignal, string>>>;
};

export type SourceTemporalAccess =
  | { readonly kind: "constant" }
  | { readonly kind: "point" }
  | { readonly kind: "range" }
  /** The implementation can only evaluate the complete finite Source domain. */
  | { readonly kind: "whole" }
  | { readonly kind: "sequential"; readonly origin: ExactTemporalValue };

/**
 * Concrete Source-local acquisition implied by an implementation's access
 * mode. Sequential forms may execute a larger span than the requested output;
 * only `requested` is published to downstream consumers.
 */
export type SourceExecutionAcquisition =
  | { readonly kind: "constant" }
  | { readonly kind: "point" }
  | { readonly kind: "range"; readonly regions: TemporalMapRegionSet }
  | { readonly kind: "whole"; readonly execution: TemporalMapRegionSet }
  | {
      readonly kind: "sequential";
      readonly origin: ExactTemporalValue;
      readonly execution: TemporalMapRegionSet;
    };

export type PlannedSourceExecution = {
  readonly task: string;
  readonly signal: AudiovisualSignal;
  readonly terminal: string;
  readonly source: string;
  readonly output: string;
  readonly requested: SourceExecutionTaskDemand["temporal"];
  readonly pictureDomain?: LocalSpatialDomain;
  readonly spatial?: SpatialRegion;
  readonly samples?: readonly TemporalMapPoint[];
  readonly acquisition: SourceExecutionAcquisition;
};

/** One Host-selected Terminal implementation for one demanded execution node. */
export type AudiovisualTerminalBinding = {
  /** Execution node id from either `demand.nodes` or `demand.sourceTasks`. */
  readonly node: string;
  readonly terminal: string;
  /** Required only for a Source-local execution node. */
  readonly sourceAccess?: SourceTemporalAccess;
};

/** Invocation-selected Terminal that closes one final Programme signal. */
export type AudiovisualOutputTerminalBinding = {
  readonly signal: AudiovisualSignal;
  readonly terminal: string;
};

export type ExecutionIsland = {
  readonly id: string;
  readonly signals: readonly AudiovisualSignal[];
  readonly terminal: string;
  readonly nodes: readonly string[];
  readonly dependencies: readonly string[];
};

/** The signal contract a transient product must satisfy across two terminal islands. */
export type DerivedRenderProductRequirement = {
  readonly id: string;
  readonly signal: AudiovisualSignal;
  /** Whether the product closes a graph node or a Source execution task. */
  readonly target: "node" | "source";
  readonly producer: string;
  readonly consumer: string;
  readonly node: string;
  readonly temporal: SourceExecutionTaskDemand["temporal"];
  /** Complete Picture domain represented by this invocation-local product. */
  readonly pictureDomain?: LocalSpatialDomain;
  readonly spatial?: SpatialRegion;
};

/** Explicit representation agreement for one cross-terminal execution edge. */
export type DerivedRenderProductBinding = {
  readonly product: string;
  /** Opaque package-owned representation identity agreed by both terminals. */
  readonly representation: string;
};

/**
 * One execution-owned product value. `Representation` belongs to the selected
 * terminals (frames, a stream, a surface, and so on), never to AVIR Core.
 */
export type DerivedRenderProduct<ProductValue> = {
  readonly requirement: DerivedRenderProductRequirement;
  readonly binding: DerivedRenderProductBinding;
  readonly value: ProductValue;
};

export type AudiovisualExecutionPlan = {
  readonly program: AudiovisualProgram["id"];
  readonly demand: AudiovisualDemandPlan;
  readonly terminalBindings: readonly AudiovisualTerminalBinding[];
  readonly outputTerminalBindings: readonly AudiovisualOutputTerminalBinding[];
  readonly sourceExecutions: readonly PlannedSourceExecution[];
  readonly islands: readonly ExecutionIsland[];
  readonly products: readonly DerivedRenderProductRequirement[];
  readonly outputs: Readonly<Partial<Record<AudiovisualSignal, string>>>;
};

export type BoundAudiovisualExecutionPlan = AudiovisualExecutionPlan & {
  readonly productBindings: readonly DerivedRenderProductBinding[];
};

export type AudiovisualIslandExecutionRequest<ProductValue = unknown> = {
  readonly island: ExecutionIsland;
  readonly nodes: readonly ExecutionNodeDemand[];
  readonly uses: readonly SourceUseDemand[];
  readonly sources: readonly PlannedSourceExecution[];
  readonly inputs: readonly DerivedRenderProduct<ProductValue>[];
  readonly products: readonly {
    readonly requirement: DerivedRenderProductRequirement;
    readonly binding: DerivedRenderProductBinding;
  }[];
  readonly finalOutputs: readonly AudiovisualSignal[];
};

export type AudiovisualIslandExecutionResult<ProductValue = unknown, OutputValue = unknown> = {
  /** Values for the requested cross-island products, addressed by binding id. */
  readonly products: readonly {
    readonly product: string;
    readonly value: ProductValue;
  }[];
  /** Terminal-owned final values requested from this island. */
  readonly outputs?: Readonly<Partial<Record<AudiovisualSignal, OutputValue>>>;
};

export type AudiovisualTerminalExecutor<ProductValue = unknown, OutputValue = unknown> = {
  readonly terminal: string;
  execute(
    request: AudiovisualIslandExecutionRequest<ProductValue>,
  ): Promise<AudiovisualIslandExecutionResult<ProductValue, OutputValue>>;
};

export type AudiovisualExecutionResult<ProductValue = unknown, OutputValue = unknown> = {
  readonly products: readonly DerivedRenderProduct<ProductValue>[];
  readonly outputs: Readonly<Partial<Record<AudiovisualSignal, OutputValue>>>;
};
