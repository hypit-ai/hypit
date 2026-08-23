import type { HostFacet } from "@hypit/host";

export const studioAdapterHostAbi = "hypit.studio-adapter@1";

/** UTF-16 offsets into the exact author source. */
export type Range = { readonly start: number; readonly end: number };

export type StudioTrackFamily = string;

export type StudioTimelinePresentation = {
  readonly entity: string;
  readonly shape: string;
  readonly depth: number;
};

export type StudioTemporalSource = {
  readonly kind: "program" | "selection" | "segment" | "moment" | "parent-schedule";
  readonly id?: string;
};

export type StudioTemporalPointProjection = {
  readonly kind: "point";
  readonly expression: string;
  readonly frame: number;
};

export type StudioTemporalWindowProjection = {
  readonly kind: "window";
  readonly startExpression: string;
  readonly endExpression: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StudioTemporalProjection = StudioTemporalPointProjection | StudioTemporalWindowProjection;

export type StudioTemporalPhase = {
  readonly id: string;
  readonly label: string;
  readonly role: "preferred" | "active" | "settled" | "enter" | "body" | "exit";
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StudioTemporalLineage = {
  readonly source: StudioTemporalSource;
  readonly projection?: StudioTemporalProjection;
  readonly phases: readonly StudioTemporalPhase[];
};

export type StudioTemporalConsumerInput = {
  readonly name: string;
  readonly record: string;
  readonly type: { readonly module: { readonly name: string; readonly version: string }; readonly name: string };
  readonly value?: unknown;
};

export type StudioTemporalConsumer = {
  readonly step: string;
  readonly producer: { readonly module: { readonly name: string; readonly version: string }; readonly name: string };
  readonly input: string;
  readonly inputs: readonly StudioTemporalConsumerInput[];
};

/** One executed Point/Window and the graph edges that consumed that exact record. */
export type StudioTemporalBinding = {
  readonly record: string;
  readonly specRecord?: string;
  readonly specId?: string;
  readonly id: string;
  readonly source: StudioTemporalSource;
  readonly projection: StudioTemporalProjection;
  readonly consumers: readonly StudioTemporalConsumer[];
};

export type StudioInteraction = {
  readonly select: boolean;
  readonly seek: "start" | "pointer" | "none";
  readonly move: boolean;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
  readonly canvasTransform: boolean;
  readonly writeback: "source" | "none";
};

export type StudioParameterControl = "text" | "number" | "boolean" | "select";
export type StudioParameterLanguage = "svml" | "svs" | "svrun";

/** A real source value that an Inspector may display or edit. */
export type StudioParameter = {
  readonly id: string;
  /** Adapter vocabulary name; unlike id this is stable across source files. */
  readonly name: string;
  readonly label: string;
  readonly control: StudioParameterControl;
  readonly value: string;
  readonly language: StudioParameterLanguage;
  readonly writable: boolean;
  readonly options?: readonly string[];
  readonly unit?: string;
  readonly source: {
    readonly path: string;
    readonly range: Range;
    readonly preimage: string;
  };
  readonly disabledReason?: string;
};

/** Adapter-owned allowlist for source parameters exposed by Studio. */
export type StudioParameterDeclaration = {
  readonly name: string;
  readonly label?: string;
  readonly control?: StudioParameterControl;
  readonly writable?: boolean;
  readonly options?: readonly string[];
  readonly unit?: string;
  /** Optional declaration for the authored element named by a reference. */
  readonly referenced?: readonly StudioParameterDeclaration[];
};

export type StudioEditOperation =
  | "move"
  | "trim-start"
  | "trim-end"
  | "slip"
  | "split"
  | "delete"
  | "duplicate"
  | "canvas-transform";

export type StudioEditCoordinate =
  | "program-frame"
  | "source-frame"
  | "canvas-pixel"
  | "normalized-progress";

export type StudioSnapTarget = "frame" | "semantic-anchor" | "item-edge";

export type StudioEditSourceRole = "start" | "end" | "duration" | "frame" | "x" | "y";

export type StudioEditSource = {
  readonly role: StudioEditSourceRole;
  readonly source: StudioParameter["source"];
};

/** A timeline affordance is present only when its source write is explicit. */
export type StudioEditHandle = {
  readonly id: string;
  readonly operation: StudioEditOperation;
  readonly enabled: boolean;
  /** Coordinate space in which the central gesture resolver measures intent. */
  readonly coordinate?: StudioEditCoordinate;
  /** Snap policy is data, not a timeline-wide guess. */
  readonly snapTo?: readonly StudioSnapTarget[];
  readonly sources?: readonly StudioEditSource[];
  readonly disabledReason?: string;
};

export type StudioMaterialPreview =
  | { readonly kind: "image"; readonly url: string }
  | { readonly kind: "video"; readonly url: string }
  | { readonly kind: "audio"; readonly url: string };

export type StudioLaneDescription = {
  readonly layout: "flat";
  readonly height: {
    readonly minPx: number;
    readonly preferredPx: number;
    readonly maxPx: number;
  };
  readonly groupId?: string;
  readonly attachedTo?: string;
  readonly order?: number;
};

export type StudioInspectorSection =
  | "authoring"
  | "resolved"
  | "material"
  | "composition"
  | "identity"
  | "run";

export type StudioInspectorDescription = {
  readonly sections: readonly StudioInspectorSection[];
};

export type StudioCandidateProvenance = {
  readonly output: string;
  readonly outputRef?: string;
  readonly candidateId?: string;
  readonly origin: "run" | "source" | "none";
  readonly status: "resolved" | "unresolved";
  readonly errors: readonly string[];
};

export type StudioSemanticAnchor = {
  readonly id: string;
  readonly kind: "segment-start" | "segment-end" | "token-start" | "token-end";
  readonly frame: number;
  readonly segmentId: string;
  readonly tokenId?: string;
};

export type StudioSemanticSegment = {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly range?: Range;
};

export type StudioSemanticToken = {
  readonly id: string;
  readonly segmentId: string;
  readonly text: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly range?: Range;
};

export type StudioSemanticTimeline = {
  readonly presentation: {
    readonly family: StudioTrackFamily;
    readonly label?: string;
    readonly icon: string;
    readonly lane: StudioLaneDescription;
  };
  readonly anchors: readonly StudioSemanticAnchor[];
  readonly segments: readonly StudioSemanticSegment[];
  readonly tokens: readonly StudioSemanticToken[];
  readonly selections: readonly {
    readonly id: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly frame: number;
  }[];
  readonly provenance: StudioCandidateProvenance;
};

export type StudioObservedValue = {
  readonly id: string;
  readonly type: { readonly module: { readonly name: string; readonly version: string }; readonly name: string };
  readonly value: unknown;
};

export type StudioPlacementChild = {
  readonly sourcePath: string;
  readonly tag: string;
  readonly id?: string;
  readonly range: Range;
  readonly attributes: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
  readonly references: readonly string[];
  readonly referenceAttributes: Readonly<Record<string, string>>;
  readonly referenceTypes: Readonly<Record<string, string>>;
  readonly values: readonly StudioObservedValue[];
};

export type StudioPlacement = {
  readonly sourcePath: string;
  readonly tag: string;
  readonly module: { readonly name: string; readonly version: string };
  readonly surface: string;
  readonly id?: string;
  readonly range: Range;
  readonly records: readonly string[];
  readonly values: readonly StudioObservedValue[];
  readonly outputs: readonly string[];
  readonly outputPorts: readonly { readonly name: string; readonly ref: string }[];
  readonly children: readonly StudioPlacementChild[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
  readonly referenceAttributes: Readonly<Record<string, string>>;
  readonly referenceTypes: Readonly<Record<string, string>>;
  readonly references: readonly string[];
};

export type StudioTrackTrace = {
  readonly placement?: string;
  readonly surface?: string;
  readonly module?: string;
  readonly authoredId?: string;
  readonly outputPorts: readonly { readonly name: string; readonly ref: string; readonly type?: string }[];
  readonly references: readonly { readonly name: string; readonly ref: string; readonly type: string }[];
};

/** Stable data view supplied to adapters; no Studio implementation object crosses the ABI. */
export type StudioResolvedTrack = {
  readonly name: string;
  readonly type: string;
  readonly outputRef: string;
  readonly candidateId?: string;
  readonly candidateOrigin: "run" | "source" | "none";
  readonly role: StudioProjectionRole;
  readonly trace: StudioTrackTrace;
  readonly surfacePreview?: StudioMaterialPreview;
  readonly value: unknown;
};

export type StudioProjectionRole =
  | "semantic-take"
  | "semantic-track"
  | "realization"
  | "media"
  | "text"
  | "caption"
  | "track";

export type StudioSpan = {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly stackOrder: number;
};

export type StudioEntityDraft = {
  readonly id: string;
  readonly authoredId: string;
  readonly label: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly stackOrder: number;
  readonly elementRange?: Range;
  readonly markerId?: string;
  readonly presentId?: string;
  readonly renderIds?: readonly string[];
  readonly presentation?: StudioTimelinePresentation;
  readonly interaction?: StudioInteraction;
  readonly temporal?: StudioTemporalLineage;
  readonly preview?: StudioMaterialPreview;
  /** Studio-local lane partition; omitted means the root lane. */
  readonly lane?: string;
  readonly parameters?: readonly StudioParameter[];
  readonly editHandles?: readonly StudioEditHandle[];
};

export type StudioAdapterContext = {
  readonly track: StudioResolvedTrack;
  readonly placement?: StudioPlacement;
  /** Package-owned Surface preview resolved by Studio from the selected domain. */
  readonly surfacePreview?: StudioMaterialPreview;
  readonly spans: readonly StudioSpan[];
  readonly values: ReadonlyMap<string, unknown>;
  /** Temporal values in this Track's actual executed dependency closure. */
  readonly temporalBindings: readonly StudioTemporalBinding[];
  readonly semantic: StudioSemanticTimeline;
  readonly generic: () => readonly StudioEntityDraft[];
};

export type StudioAdapter = {
  readonly id: string;
  readonly role: StudioProjectionRole;
  readonly output: {
    readonly type: string;
    readonly surface?: string;
    readonly modules?: readonly string[];
    readonly siblingType?: string;
  };
  readonly family?: StudioTrackFamily;
  readonly label?: string;
  readonly icon?: string;
  /** Opts root timeline entities into the component's package-owned Surface preview. */
  readonly poster?: { readonly source: "surface-preview" };
  readonly attachments?: readonly StudioLaneAttachment[];
  readonly realizationPorts?: readonly string[];
  readonly dependencies?: readonly {
    readonly type: string;
    readonly role: StudioProjectionRole;
  }[];
  readonly interaction?: StudioInteraction;
  readonly lane?: StudioLaneDescription;
  readonly inspector?: StudioInspectorDescription;
  readonly parameters?: readonly StudioParameterDeclaration[];
  /** Operations this adapter explicitly understands for its entities. */
  readonly editOperations?: readonly StudioEditOperation[];
  readonly project?: (context: StudioAdapterContext) => readonly StudioEntityDraft[];
};

export type StudioAdapterContribution = {
  readonly format: "hypit.studio-adapters@1";
  readonly adapters: readonly StudioAdapter[];
};

export type StudioAdapterHostFacet = HostFacet & {
  readonly abi: typeof studioAdapterHostAbi;
  readonly implementation: StudioAdapterContribution;
};

export function createStudioAdapterHostFacet(adapters: readonly StudioAdapter[]): StudioAdapterHostFacet {
  return {
    abi: studioAdapterHostAbi,
    implementation: { format: "hypit.studio-adapters@1", adapters },
  };
}

/**
 * Qualify package-local adapter names with identity established by the package loader.
 * The executable facet cannot choose or impersonate its physical owner.
 */
export function studioAdaptersFromPackage(
  owner: string,
  facets: readonly HostFacet[],
): readonly StudioAdapter[] {
  if (owner.length === 0 || owner.includes("#")) throw new Error(`Invalid Studio adapter package identity: ${owner}`);
  return facets.flatMap((facet) => {
    if (facet.abi !== studioAdapterHostAbi) return [];
    const contribution = facet.implementation as Partial<StudioAdapterContribution>;
    if (contribution.format !== "hypit.studio-adapters@1" || !Array.isArray(contribution.adapters)) {
      throw new Error(`Studio adapter facet from ${owner} has an invalid contribution`);
    }
    return contribution.adapters.map((adapter) => {
      if (adapter.id.length === 0 || adapter.id.includes("#")) {
        throw new Error(`Studio adapter ids are package-local names without '#': ${owner}#${adapter.id}`);
      }
      // The Host, not executable package code, establishes the global identity.
      return { ...adapter, id: `${owner}#${adapter.id}` };
    });
  });
}

export type StudioLaneAttachment = {
  readonly id: string;
  readonly family: StudioTrackFamily;
  readonly label?: string;
  readonly icon: string;
  readonly facet: "visual" | "audio";
  readonly lane: StudioLaneDescription;
  readonly interaction?: StudioInteraction;
  readonly inspector?: StudioInspectorDescription;
  readonly parameters?: readonly StudioParameterDeclaration[];
  readonly editOperations?: readonly StudioEditOperation[];
};

export const readonlyInteraction: StudioInteraction = {
  select: true,
  seek: "pointer",
  move: false,
  trimStart: false,
  trimEnd: false,
  canvasTransform: false,
  writeback: "none",
};

export function sameSurfaceValue(context: StudioAdapterContext, port: string): unknown {
  const ref = context.track.trace.outputPorts.find((candidate) => candidate.name === port)?.ref;
  return ref === undefined ? undefined : context.values.get(ref);
}

function carriesIdentity(value: unknown, id: string): boolean {
  return value !== null && typeof value === "object"
    && !Array.isArray(value) && (value as { readonly id?: unknown }).id === id;
}

/** Find executed projections directly consumed beside a domain value with this identity. */
export function temporalBindingsFor(
  context: StudioAdapterContext,
  subjectId: string,
  input?: string,
): readonly StudioTemporalBinding[] {
  return context.temporalBindings.filter((binding) => binding.consumers.some((consumer) =>
    (input === undefined || consumer.input === input)
    && consumer.inputs.some((candidate) => carriesIdentity(candidate.value, subjectId))));
}

export function temporalLineageFor(
  context: StudioAdapterContext,
  subjectId: string,
  input?: string,
): StudioTemporalLineage | undefined {
  const found = temporalBindingsFor(context, subjectId, input)[0];
  return found === undefined ? undefined : {
    source: found.source,
    projection: found.projection,
    phases: [],
  };
}

export function childEntities(
  context: StudioAdapterContext,
  items: readonly { readonly id: string; readonly startFrame: number; readonly endFrameExclusive: number; readonly stackOrder: number }[],
  entity: StudioTimelinePresentation["entity"],
  shape: StudioTimelinePresentation["shape"],
): readonly StudioEntityDraft[] {
  const children = new Map(context.placement?.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]) ?? []);
  return items.map((item) => {
    const child = children.get(item.id) ?? [...children.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .find(([id]) => item.id.startsWith(`${id}::`))?.[1];
    // A dedicated adapter does not reverse-engineer renderer ids. Only an exact
    // public identity is safe; richer renderer correspondence needs its own
    // declared realization rather than another naming convention.
    const render = context.spans.find((span) => span.id === item.id);
    return {
      id: `${context.track.outputRef}:entity:${item.id}`,
      authoredId: child?.id ?? item.id,
      label: child?.id ?? item.id,
      startFrame: item.startFrame,
      endFrameExclusive: item.endFrameExclusive,
      stackOrder: item.stackOrder,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(render === undefined ? {} : { presentId: render.id, renderIds: [render.id] }),
      presentation: { entity, shape, depth: 0 },
      interaction: readonlyInteraction,
    };
  });
}
