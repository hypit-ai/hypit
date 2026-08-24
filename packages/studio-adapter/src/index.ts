import type { HostFacet } from "@hypit/host";
import type { CanonicalValue, ValueSchema } from "@hypit/protocol";

export const studioAdapterHostAbi = "hypit.studio-adapter@1";

/** UTF-16 offsets into the exact author source. */
export type Range = { readonly start: number; readonly end: number };

export type StudioTrackFamily = string;
export type StudioIcon =
  | "brand"
  | "captions"
  | "component"
  | "layers"
  | "ranking"
  | "text"
  | "timeline"
  | "video"
  | "waveform";
/** Studio-owned visual palette. Domain families never become CSS selectors. */
export type StudioTimelineTone =
  | "blue"
  | "green"
  | "teal"
  | "violet"
  | "magenta"
  | "orange"
  | "orange-muted"
  | "neutral";

export type StudioTimelinePresentation = {
  readonly entity: string;
  /** Studio-owned shell. It never decides whether title, time or body exists. */
  readonly chrome: "standard" | "group" | "point";
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

export type StudioParameterControl = "text" | "number" | "boolean" | "select" | "color" | "list" | "record";
export type StudioParameterLanguage = "svml" | "svs" | "svrun";

/** A real author endpoint. Its existence never implies Inspector visibility. */
export type StudioSourceBinding = {
  readonly id: string;
  /** Companion-owned path, stable across source files and projected entities. */
  readonly binding: string;
  /** Author vocabulary name at the terminal source element. */
  readonly name: string;
  readonly value: CanonicalValue;
  /** Public author value structure; absent only for legacy scalar bindings. */
  readonly schema?: ValueSchema;
  readonly language: StudioParameterLanguage;
  readonly writable: boolean;
  readonly source: {
    readonly path: string;
    readonly range: Range;
    readonly preimage: string;
    /** Generic syntax framing used only when an absent author property is first materialized. */
    readonly prefix?: string;
    readonly suffix?: string;
  };
  readonly disabledReason?: string;
};

export type StudioInspectorDomain = "where" | "how" | "when";

export type StudioInspectorPageDeclaration = {
  readonly id: string;
  readonly label: string;
};

export type StudioInspectorSectionDeclaration = {
  readonly id: string;
  readonly label: string;
};

/** One visible, writable field selected from a Companion's source bindings. */
export type StudioInspectorFieldDeclaration = {
  readonly binding: string;
  readonly label: string;
  readonly domain: StudioInspectorDomain;
  /** Omit for a domain with one unlabelled page. */
  readonly page?: StudioInspectorPageDeclaration;
  readonly section: StudioInspectorSectionDeclaration;
  readonly summary?: string;
  /** Omit when the binding's public schema selects the finite Studio control. */
  readonly control?: StudioParameterControl;
  readonly options?: readonly string[];
  readonly unit?: string;
};

/** Resolved Inspector DTO. Studio renders it and executes its exact source write. */
export type StudioInspectorField = Omit<StudioInspectorFieldDeclaration, "control"> & {
  readonly id: string;
  readonly control: StudioParameterControl;
  readonly value: CanonicalValue;
  readonly schema?: ValueSchema;
  readonly language: StudioParameterLanguage;
  readonly source: StudioSourceBinding["source"];
};

/** Adapter-owned source allowlist. It contains no editor presentation. */
export type StudioSourceBindingDeclaration = {
  readonly name: string;
  readonly writable?: boolean;
  readonly schema?: ValueSchema;
  /** Optional declaration for the authored element named by a reference. */
  readonly referenced?: readonly StudioSourceBindingDeclaration[];
  /**
   * Companion-owned source allowlist for the SVS Recipe reached through this
   * reference. Inspector presentation is declared separately.
   */
  readonly recipe?: StudioRecipeReferenceBindingDeclaration;
};

/** An explicit reference path from one author input to one SVS Recipe. */
export type StudioRecipeReferenceBindingDeclaration = {
  /** Reference-valued attributes followed on local authored elements, in order. */
  readonly through?: readonly string[];
  /** Package-owned source allowlist for properties of the reached Recipe. */
  readonly bindings: readonly StudioRecipeBindingDeclaration[];
};

export type StudioRecipeBindingDeclaration = {
  readonly name: string;
  readonly writable?: boolean;
  /** Domain-owned public Recipe value structure, never editor presentation. */
  readonly schema?: ValueSchema;
  /** Typed public fallback; Studio writes the property only after the author changes it. */
  readonly fallback?: CanonicalValue;
};

export type StudioTimelineGesture =
  | "move"
  | "trim-start"
  | "trim-end";

export type StudioEditCoordinate =
  | "program-frame"
  | "semantic-anchor"
  | "source-frame"
  | "canvas-pixel"
  | "normalized-progress";

export type StudioSnapTarget = "frame" | "semantic-anchor" | "item-edge";

export type StudioEditSourceRole = "start" | "end" | "duration" | "frame" | "x" | "y";

export type StudioEditSource = {
  readonly role: StudioEditSourceRole;
  readonly source: StudioSourceBinding["source"];
};

export type StudioSemanticEditTarget =
  | {
      readonly kind: "selection";
      readonly id: string;
      readonly startAnchorId: string;
      readonly endAnchorId: string;
    }
  | {
      readonly kind: "moment";
      readonly id: string;
      readonly anchorId: string;
    };

/** A timeline affordance is present only when its source write is explicit. */
export type StudioEditHandle = {
  readonly id: string;
  readonly operation: "timeline.adjust";
  readonly gesture: StudioTimelineGesture;
  readonly enabled: boolean;
  /** Coordinate space in which the central gesture resolver measures intent. */
  readonly coordinate?: StudioEditCoordinate;
  /** How moving a semantic Point changes the visible entity before recompilation. */
  readonly moveEffect?: "translate-window" | "move-start";
  /** Snap policy is data, not a timeline-wide guess. */
  readonly snapTo?: readonly StudioSnapTarget[];
  readonly sources?: readonly StudioEditSource[];
  /** Shared Script identity adjusted by this rectangle; every consumer follows it. */
  readonly semantic?: StudioSemanticEditTarget;
  readonly disabledReason?: string;
};

export type StudioTimelineEditParameter = {
  readonly role: Extract<StudioEditSourceRole, "start" | "end" | "duration">;
  /** Exact Companion-declared parameter vocabulary name. */
  readonly parameter: string;
};

export type StudioTimelineEditTargetDeclaration =
  | {
      readonly kind: "semantic-source";
      readonly source: "selection" | "moment";
      readonly moveEffect?: "translate-window" | "move-start";
    }
  | {
      readonly kind: "source-parameters";
      readonly when: {
        readonly source: StudioTemporalSource["kind"];
        readonly projection?: StudioTemporalProjection["kind"];
      };
      readonly parameters: readonly StudioTimelineEditParameter[];
    }
  | {
      readonly kind: "disabled";
      readonly when: {
        readonly source: StudioTemporalSource["kind"];
        readonly projection?: StudioTemporalProjection["kind"];
      };
      readonly reason: string;
    };

/** Companion-owned inverse choices for one Studio timeline gesture. */
export type StudioTimelineEditDeclaration = {
  readonly gesture: StudioTimelineGesture;
  readonly targets: readonly StudioTimelineEditTargetDeclaration[];
};

/** A source descriptor; Companion packages never depend on Studio's HTTP routes. */
export type StudioPreviewSource =
  | { readonly kind: "artifact"; readonly digest: string }
  | {
      readonly kind: "surface-preview";
      readonly module: string;
      readonly version: string;
      readonly surface: string;
    };

export type StudioMaterialPreview = {
  readonly kind: "image" | "video" | "audio";
  readonly source: StudioPreviewSource;
};

/** Finite, composable timeline body vocabulary owned by Studio. */
export type StudioDisplayLayer =
  | {
      readonly kind: "text";
      readonly role: "content";
      readonly text: string;
    }
  | {
      readonly kind: "preview";
      readonly role: "decoration" | "content";
      readonly preview: StudioMaterialPreview;
      readonly layout: "repeat-x" | "cover" | "contain" | "storyboard" | "waveform";
    };

export type StudioEntityDisplay = {
  /** First row. Studio always places computed time immediately after it. */
  readonly title: string;
  /** Ordered back-to-front body layers. */
  readonly layers: readonly StudioDisplayLayer[];
};

export type StudioLaneDescription = {
  readonly heightPx: number;
  readonly groupId?: string;
  readonly attachedTo?: string;
  readonly order?: number;
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
    readonly tone: StudioTimelineTone;
    readonly label?: string;
    readonly icon: StudioIcon;
    readonly lane: StudioLaneDescription;
  };
  readonly anchors: readonly StudioSemanticAnchor[];
  readonly segments: readonly StudioSemanticSegment[];
  readonly tokens: readonly StudioSemanticToken[];
  readonly selections: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly anchorId: string;
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
  | "track";

export type StudioSpan = {
  readonly id: string;
  /** Exact public terminal provenance; never inferred from id syntax. */
  readonly subjectId?: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly stackOrder: number;
};

export type StudioEntityDraft = {
  readonly id: string;
  readonly authoredId: string;
  readonly display: StudioEntityDisplay;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly stackOrder: number;
  readonly elementRange?: Range;
  readonly markerId?: string;
  readonly presentId?: string;
  readonly renderIds?: readonly string[];
  /** Resolved author references that differ per derived entity, such as one Cue's actual Style. */
  readonly parameterReferences?: Readonly<Record<string, string>>;
  readonly presentation?: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  /** Studio-local lane partition; omitted means the root lane. */
  readonly lane?: string;
  /** Optional per-entity override of the owning lane's declared inverses. */
  readonly timelineEdits?: readonly StudioTimelineEditDeclaration[];
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
  /** Visual token selected from Studio's finite palette. */
  readonly tone?: StudioTimelineTone;
  readonly label?: string;
  readonly icon?: StudioIcon;
  /** Opts root timeline entities into the component's package-owned Surface preview. */
  readonly poster?: { readonly source: "surface-preview" };
  readonly attachments?: readonly StudioLaneAttachment[];
  /** Same-Surface output values required to project this Track for Studio. */
  readonly requiredValues?: readonly string[];
  readonly lane?: StudioLaneDescription;
  /** Exact author endpoints required by Inspector fields or timeline inverses. */
  readonly bindings?: readonly StudioSourceBindingDeclaration[];
  /** Visible field table. Undeclared bindings remain invisible. */
  readonly inspector?: readonly StudioInspectorFieldDeclaration[];
  /** Exact inverse choices this adapter understands for its entities. */
  readonly timelineEdits?: readonly StudioTimelineEditDeclaration[];
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
  readonly tone?: StudioTimelineTone;
  readonly label?: string;
  readonly icon: StudioIcon;
  readonly facet: "visual" | "audio";
  readonly lane: StudioLaneDescription;
  readonly bindings?: readonly StudioSourceBindingDeclaration[];
  readonly inspector?: readonly StudioInspectorFieldDeclaration[];
  readonly timelineEdits?: readonly StudioTimelineEditDeclaration[];
};

/**
 * Reusable declaration for a component that consumes an externalized Window.
 * The Companion still binds the component's exact author parameter names.
 */
export function projectedWindowTimelineEdits(input: {
  readonly start: string;
  readonly end: string;
  readonly duration?: string;
}): readonly StudioTimelineEditDeclaration[] {
  const programWindow = { source: "program" as const };
  const momentWindow = { source: "moment" as const };
  return [
    {
      gesture: "move",
      targets: [
        { kind: "semantic-source", source: "selection", moveEffect: "translate-window" },
        { kind: "semantic-source", source: "moment", moveEffect: "translate-window" },
        {
          kind: "source-parameters", when: programWindow,
          parameters: [{ role: "start", parameter: input.start }, { role: "end", parameter: input.end }],
        },
      ],
    },
    {
      gesture: "trim-start",
      targets: [
        { kind: "semantic-source", source: "selection" },
        { kind: "disabled", when: momentWindow, reason: "起点由 Moment 决定；移动实体可以改 Moment，但不能单独裁起点。" },
        {
          kind: "source-parameters", when: programWindow,
          parameters: [{ role: "start", parameter: input.start }],
        },
      ],
    },
    {
      gesture: "trim-end",
      targets: [
        { kind: "semantic-source", source: "selection" },
        ...(input.duration === undefined ? [{
          kind: "disabled" as const, when: momentWindow,
          reason: "该 Moment 消费没有声明独立的 duration 参数。",
        }] : [{
          kind: "source-parameters" as const, when: momentWindow,
          parameters: [{ role: "duration" as const, parameter: input.duration }],
        }]),
        {
          kind: "source-parameters", when: programWindow,
          parameters: [{ role: "end", parameter: input.end }],
        },
        ...(input.duration === undefined ? [] : [{
          kind: "source-parameters" as const, when: programWindow,
          parameters: [{ role: "duration" as const, parameter: input.duration }],
        }]),
      ],
    },
  ];
}

/** Reusable declaration for a component entity activated by an externalized Point. */
export function projectedPointTimelineEdits(): readonly StudioTimelineEditDeclaration[] {
  return [{
    gesture: "move",
    targets: [{ kind: "semantic-source", source: "moment", moveEffect: "move-start" }],
  }];
}

/** A Window whose only reversible author source is an external Selection. */
export function selectionWindowTimelineEdits(): readonly StudioTimelineEditDeclaration[] {
  return (["move", "trim-start", "trim-end"] as const).map((gesture) => ({
    gesture,
    targets: [{ kind: "semantic-source", source: "selection" }],
  }));
}

export function sameSurfaceValue(context: StudioAdapterContext, port: string): unknown {
  const ref = context.track.trace.outputPorts.find((candidate) => candidate.name === port)?.ref;
  return ref === undefined ? undefined : context.values.get(ref);
}

export function requiredSurfaceValue(context: StudioAdapterContext, port: string): unknown {
  const value = sameSurfaceValue(context, port);
  if (value === undefined) {
    throw new Error(`Studio Companion ${context.track.type} requires same-Surface value port ${port}`);
  }
  return value;
}

export function artifactPreview(
  kind: StudioMaterialPreview["kind"],
  digest: string,
): StudioMaterialPreview {
  return { kind, source: { kind: "artifact", digest } };
}

export function previewLayer(
  preview: StudioMaterialPreview,
  layout: Extract<StudioDisplayLayer, { readonly kind: "preview" }>["layout"],
  role: Extract<StudioDisplayLayer, { readonly kind: "preview" }>["role"] = "content",
): StudioDisplayLayer {
  return { kind: "preview", role, preview, layout };
}

export function textLayer(text: string): StudioDisplayLayer {
  return { kind: "text", role: "content", text };
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
  items: readonly {
    /** Exact identity of the projected domain item consumed by Temporal/renderer bindings. */
    readonly id: string;
    /** Exact author-owned entity realized by this projected item, when the identities differ. */
    readonly subjectId?: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
    readonly stackOrder: number;
  }[],
  entity: StudioTimelinePresentation["entity"],
  chrome: StudioTimelinePresentation["chrome"],
): readonly StudioEntityDraft[] {
  const children = new Map(context.placement?.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]) ?? []);
  return items.map((item) => {
    const authoredId = item.subjectId ?? item.id;
    const child = children.get(authoredId);
    // Both correspondences are exact public facts: the Program item identity
    // and the renderer's declared subject. No renderer naming convention is
    // interpreted here.
    const renders = context.spans.filter((span) => span.id === item.id || span.subjectId === authoredId);
    const render = renders[0];
    return {
      id: `${context.track.outputRef}:entity:${item.id}`,
      authoredId,
      display: { title: authoredId, layers: [] },
      startFrame: item.startFrame,
      endFrameExclusive: item.endFrameExclusive,
      stackOrder: item.stackOrder,
      ...(child === undefined ? {} : { elementRange: child.range }),
      ...(render === undefined ? {} : { presentId: render.id, renderIds: renders.map((span) => span.id) }),
      presentation: { entity, chrome },
    };
  });
}
