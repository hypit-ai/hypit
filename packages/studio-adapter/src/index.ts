import type { HostFacet } from "@hypit/host";
import { sameType } from "@hypit/protocol";
import type { CanonicalValue, ModuleRef, TypeRef, ValueSchema } from "@hypit/protocol";

export const studioCompanionHostAbi = "hypit.studio-adapter@1";

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
  readonly spaceId: string;
  readonly narrativeId?: string;
  readonly kind: "program" | "selection" | "segment" | "moment";
  readonly id: string;
};

export type StudioTemporalAuthority =
  | {
      readonly kind: "semantic";
      readonly source: StudioTemporalSource;
      readonly boundary: "start" | "end" | "cue";
    }
  | {
      readonly kind: "parameter";
      readonly binding: string;
      readonly relation: "direct" | "after-start" | "before-end";
    }
  | { readonly kind: "fixed" };

export type StudioTemporalInstantProjection = {
  readonly kind: "instant";
  readonly expression: string;
  readonly reference:
    | "program.start" | "program.end"
    | "selection.start" | "selection.end"
    | "segment.start" | "segment.end"
    | "moment.cue" | "absolute";
  readonly frame: number;
  readonly source: StudioTemporalSource;
  readonly authority: StudioTemporalAuthority;
};

export type StudioTemporalWindowProjection = {
  readonly kind: "window";
  readonly start: StudioTemporalInstantProjection;
  readonly end: StudioTemporalInstantProjection;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StudioTemporalProjection = StudioTemporalInstantProjection | StudioTemporalWindowProjection;

export type StudioTemporalPhase = {
  readonly id: string;
  readonly label: string;
  readonly role: "preferred" | "active" | "settled" | "enter" | "body" | "exit";
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StudioTemporalLineage = {
  readonly projection: StudioTemporalProjection;
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
  /** Projection plumbing is classified by Studio's graph reader, never by a Companion name guess. */
  readonly role: "projection" | "domain";
  readonly inputs: readonly StudioTemporalConsumerInput[];
};

/** One executed Instant/Window and the graph edges that consumed that exact record. */
export type StudioTemporalBinding = {
  readonly record: string;
  readonly subjectId: string;
  readonly id: string;
  readonly projection: StudioTemporalProjection;
  readonly consumers: readonly StudioTemporalConsumer[];
};

export const studioParameterControls = [
  "text", "number", "boolean", "select", "color", "list", "record",
] as const;
export type StudioParameterControl = typeof studioParameterControls[number];
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
    /** Exact compilation-local author endpoint when the Frontend supplied one. */
    readonly endpoint?: string;
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

/** Companion-owned source allowlist. It contains no editor presentation. */
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
      readonly narrativeId: string;
      readonly id: string;
      readonly startAnchorId: string;
      readonly endAnchorId: string;
    }
  | {
      readonly kind: "moment";
      readonly narrativeId: string;
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
  /** Exact endpoint authority used to validate and execute this inverse. */
  readonly temporal?: StudioTemporalProjection;
  readonly disabledReason?: string;
};

/** A source descriptor; Companion packages never depend on Studio's HTTP routes. */
export type StudioPreviewSource =
  | { readonly kind: "artifact"; readonly resource: string }
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
  /** Height of this single timeline lane; overlapping entities share it. */
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
  readonly kind: "program-start" | "segment-start" | "segment-end" | "token-start" | "token-end" | "program-end";
  readonly frame: number;
  readonly segmentId?: string;
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
  readonly spaceId: string;
  readonly narrativeId: string;
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
  /** Exact compilation-local author element identity from AuthorProvenance. */
  readonly authorElement?: string;
  readonly authorEndpoints?: Readonly<Record<string, string>>;
  readonly sourcePath: string;
  readonly tag: string;
  readonly id?: string;
  readonly range: Range;
  readonly attributes: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
  readonly references: readonly string[];
  readonly referenceAttributes: Readonly<Record<string, string>>;
  /** Resolved graph refs keyed by author input; raw written paths remain above. */
  readonly resolvedReferenceAttributes?: Readonly<Record<string, string>>;
  readonly referenceTypes: Readonly<Record<string, string>>;
  readonly values: readonly StudioObservedValue[];
  readonly records?: readonly string[];
  readonly outputs?: readonly string[];
};

export type StudioPlacement = {
  /** Exact compilation-local author element identity from AuthorProvenance. */
  readonly authorElement?: string;
  readonly authorEndpoints?: Readonly<Record<string, string>>;
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
  /** Resolved graph refs keyed by author input; raw written paths remain above. */
  readonly resolvedReferenceAttributes?: Readonly<Record<string, string>>;
  readonly referenceTypes: Readonly<Record<string, string>>;
  readonly references: readonly string[];
};

export type StudioTrackTrace = {
  readonly placement?: string;
  readonly surface?: string;
  readonly module?: ModuleRef;
  readonly authoredId?: string;
  readonly outputPorts: readonly {
    readonly name: string;
    readonly ref: string;
    readonly type?: string;
    readonly typeRef?: TypeRef;
  }[];
  readonly references: readonly {
    /** Exact authored input attribute when this is a direct Surface reference. */
    readonly input?: string;
    readonly name: string;
    readonly ref: string;
    readonly type: string;
    readonly typeRef: TypeRef;
  }[];
};

/** Stable data view supplied to Companions; no Studio implementation object crosses the ABI. */
export type StudioResolvedTrack = {
  readonly name: string;
  /** Short display name retained for diagnostics and UI only. */
  readonly type: string;
  /** Exact protocol identity used for every Companion decision. */
  readonly typeRef: TypeRef;
  readonly outputRef: string;
  readonly candidateId?: string;
  readonly candidateOrigin: "run" | "source" | "none";
  readonly role: StudioViewRole;
  readonly trace: StudioTrackTrace;
  readonly surfacePreview?: StudioMaterialPreview;
  readonly value: unknown;
};

export type StudioViewRole =
  | "semantic-track"
  | "supporting-value"
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
  /** Back-to-front timeline order. Ties preserve projection order. Selection raises only the timeline item. */
  readonly stackOrder: number;
  readonly elementRange?: Range;
  readonly markerId?: string;
  readonly presentId?: string;
  /** Rendered parts belonging to this entity, including phases beyond its editable timeline interval. */
  readonly renderIds?: readonly string[];
  /** Resolved author references that differ per derived entity, such as one Cue's actual Style. */
  readonly parameterReferences?: Readonly<Record<string, string>>;
  readonly presentation?: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  /** Studio-local lane partition; omitted means the root lane. */
  readonly lane?: string;
};

export type StudioTrackCompanionContext = {
  readonly track: StudioResolvedTrack;
  readonly placement?: StudioPlacement;
  /** Package-owned Surface preview resolved by Studio from the selected domain. */
  readonly surfacePreview?: StudioMaterialPreview;
  readonly spans: readonly StudioSpan[];
  readonly values: ReadonlyMap<string, unknown>;
  /** Temporal values in this Track's actual executed dependency closure. */
  readonly temporalBindings: readonly StudioTemporalBinding[];
  readonly semantic: StudioSemanticTimeline | undefined;
  readonly generic: () => readonly StudioEntityDraft[];
};

export type StudioTrackCompanion = {
  readonly id: string;
  readonly role: StudioViewRole;
  readonly output: {
    readonly type: TypeRef;
    readonly surface?: string;
    readonly modules?: readonly ModuleRef[];
    readonly siblingType?: TypeRef;
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
  readonly project?: (context: StudioTrackCompanionContext) => readonly StudioEntityDraft[];
};

export type StudioCompanionContribution = {
  readonly format: "hypit.studio-companions@1";
  readonly tracks: readonly StudioTrackCompanion[];
  readonly films?: readonly StudioFilmCompanion[];
  readonly scripts?: readonly StudioScriptCompanion[];
};

/** Declarative Film boundary. Studio follows only the references named here. */
export type StudioFilmCompanion = {
  readonly id: string;
  readonly match: {
    readonly module: ModuleRef;
    readonly surface: string;
    readonly outputType: TypeRef;
  };
  readonly timeSources: readonly { readonly attribute: string; readonly type: TypeRef }[];
  readonly tracks: {
    readonly childSurface: string;
    readonly sourceAttribute: string;
    readonly types: readonly TypeRef[];
  };
};

export type StudioScriptSourceMap = {
  readonly companion: string;
  readonly narrativeId: string;
  readonly sourcePath: string;
  readonly range: Range;
  readonly content: Range;
  readonly segments: readonly { readonly id: string; readonly range: Range }[];
  readonly selections: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    readonly open: Range;
    readonly close: Range;
  }[];
  readonly moments: readonly { readonly id: string; readonly anchorId: string; readonly range: Range }[];
  readonly tokens: readonly { readonly id: string; readonly range: Range }[];
};

export type StudioScriptAdjustment =
  | { readonly kind: "selection"; readonly id: string; readonly startAnchorId: string; readonly endAnchorId: string }
  | { readonly kind: "moment"; readonly id: string; readonly anchorId: string };

/** Script grammar companion. It owns source observation and semantic inverse edits. */
export type StudioScriptCompanion = {
  readonly id: string;
  readonly match: { readonly module: ModuleRef; readonly surface: string };
  readonly observe: (input: {
    readonly sourceName: string;
    readonly source: string;
    readonly tag: string;
    readonly openingStart: number;
    readonly contentStart: number;
    /** Authoritative end returned by the raw Surface after it parsed its own grammar. */
    readonly nextOffset?: number;
    readonly attributes: Readonly<Record<string, unknown>>;
  }) => Omit<StudioScriptSourceMap, "companion"> | undefined;
  readonly adjust: (input: {
    readonly sourceName: string;
    readonly source: string;
    readonly adjustment: StudioScriptAdjustment;
  }) => string;
};

export type StudioCompanionHostFacet = HostFacet & {
  readonly abi: typeof studioCompanionHostAbi;
  readonly implementation: StudioCompanionContribution;
};

export function createStudioTrackCompanionHostFacet(tracks: readonly StudioTrackCompanion[]): StudioCompanionHostFacet {
  return {
    abi: studioCompanionHostAbi,
    implementation: { format: "hypit.studio-companions@1", tracks },
  };
}

export function createStudioCompanionHostFacet(input: {
  readonly tracks?: readonly StudioTrackCompanion[];
  readonly films?: readonly StudioFilmCompanion[];
  readonly scripts?: readonly StudioScriptCompanion[];
}): StudioCompanionHostFacet {
  return {
    abi: studioCompanionHostAbi,
    implementation: {
      format: "hypit.studio-companions@1",
      tracks: input.tracks ?? [],
      ...(input.films === undefined ? {} : { films: input.films }),
      ...(input.scripts === undefined ? {} : { scripts: input.scripts }),
    },
  };
}

export type StudioPackageContribution = {
  readonly tracks: readonly StudioTrackCompanion[];
  readonly films: readonly StudioFilmCompanion[];
  readonly scripts: readonly StudioScriptCompanion[];
};

function qualify(owner: string, local: string, subject: string): string {
  if (local.length === 0 || local.includes("#")) {
    throw new Error(`${subject} ids are package-local names without '#': ${owner}#${local}`);
  }
  return `${owner}#${local}`;
}

export function studioContributionFromPackage(
  owner: string,
  facets: readonly HostFacet[],
): StudioPackageContribution {
  if (owner.length === 0 || owner.includes("#")) throw new Error(`Invalid Studio companion package identity: ${owner}`);
  const tracks: StudioTrackCompanion[] = [];
  const films: StudioFilmCompanion[] = [];
  const scripts: StudioScriptCompanion[] = [];
  for (const facet of facets) {
    if (facet.abi !== studioCompanionHostAbi) continue;
    const contribution = facet.implementation as Partial<StudioCompanionContribution>;
    if (contribution.format !== "hypit.studio-companions@1" || !Array.isArray(contribution.tracks)) {
      throw new Error(`Studio companion facet from ${owner} has an invalid contribution`);
    }
    tracks.push(...contribution.tracks.map((track) => ({
      ...track,
      id: qualify(owner, track.id, "Studio Track companion"),
    })));
    films.push(...(contribution.films ?? []).map((film) => ({
      ...film,
      id: qualify(owner, film.id, "Studio Film companion"),
    })));
    scripts.push(...(contribution.scripts ?? []).map((script) => ({
      ...script,
      id: qualify(owner, script.id, "Studio Script companion"),
    })));
  }
  return { tracks, films, scripts };
}

/**
 * Qualify package-local Companion names with identity established by the package loader.
 * The executable facet cannot choose or impersonate its physical owner.
 */
export function studioTrackCompanionsFromPackage(
  owner: string,
  facets: readonly HostFacet[],
): readonly StudioTrackCompanion[] {
  return studioContributionFromPackage(owner, facets).tracks;
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
};

export function sameSurfaceValue(context: StudioTrackCompanionContext, port: string): unknown {
  const ref = context.track.trace.outputPorts.find((candidate) => candidate.name === port)?.ref;
  return ref === undefined ? undefined : context.values.get(ref);
}

export function requiredSurfaceValue(context: StudioTrackCompanionContext, port: string): unknown {
  const value = sameSurfaceValue(context, port);
  if (value === undefined) {
    throw new Error(`Studio Companion ${context.track.type} requires same-Surface value port ${port}`);
  }
  return value;
}

/** Resolve one direct authored reference by input name and exact public TypeRef. */
export function requiredReferencedValue(
  context: StudioTrackCompanionContext,
  input: string,
  type: TypeRef,
): unknown {
  const found = context.track.trace.references.filter((reference) =>
    reference.input === input && sameType(reference.typeRef, type));
  if (found.length !== 1) {
    throw new Error(`Studio Companion ${context.track.type} requires one ${input} reference of type ${type.module.name}@${type.module.version}#${type.name}`);
  }
  const value = context.values.get(found[0]!.ref);
  if (value === undefined) {
    throw new Error(`Studio Companion ${context.track.type} cannot resolve referenced value ${found[0]!.ref}`);
  }
  return value;
}

export function artifactPreview(
  kind: StudioMaterialPreview["kind"],
  resource: string,
): StudioMaterialPreview {
  return { kind, source: { kind: "artifact", resource } };
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

/** Find the executed projection that explicitly names this domain entity as its subject. */
export function temporalBindingsFor(
  context: StudioTrackCompanionContext,
  subjectId: string,
  input?: string,
): readonly StudioTemporalBinding[] {
  return context.temporalBindings.filter((binding) =>
    binding.subjectId === subjectId
    && binding.consumers.some((consumer) =>
      consumer.role === "domain"
      && (input === undefined || consumer.input === input)));
}

/** Find the exact authored child whose typed public value owns a projected identity. */
export function authoredChildFor(
  context: StudioTrackCompanionContext,
  authoredId: string,
  types: readonly TypeRef[],
): StudioPlacementChild | undefined {
  const children = context.placement?.children ?? [];
  const explicit = children.filter((child) => child.id === authoredId);
  const typed = children.filter((child) => child.values.some((observed) =>
    types.some((type) => sameType(observed.type, type))
    && observed.value !== null
    && typeof observed.value === "object"
    && !Array.isArray(observed.value)
    && (observed.value as { readonly id?: unknown }).id === authoredId));
  const found = [...new Set([...explicit, ...typed])];
  if (found.length > 1) throw new Error(`Studio authored child identity ${authoredId} is ambiguous.`);
  return found[0];
}

export function temporalLineageFor(
  context: StudioTrackCompanionContext,
  subjectId: string,
  input?: string,
): StudioTemporalLineage | undefined {
  const found = temporalBindingsFor(context, subjectId, input);
  if (found.length > 1) {
    throw new Error(`Studio Temporal lineage is ambiguous for ${subjectId}${input === undefined ? "" : ` at ${input}`}.`);
  }
  const binding = found[0];
  return binding === undefined ? undefined : {
    projection: binding.projection,
    phases: [],
  };
}

/** Unique semantic author identity carried by one projection, when there is one. */
export function temporalSemanticSource(lineage: StudioTemporalLineage | undefined): StudioTemporalSource | undefined {
  if (lineage === undefined) return undefined;
  const projection = lineage.projection;
  const endpoints = projection.kind === "instant" ? [projection] : [projection.start, projection.end];
  const semantic = endpoints.flatMap((endpoint) => endpoint.authority.kind === "semantic"
    ? [endpoint.authority.source]
    : []);
  const first = semantic[0];
  if (first === undefined) return undefined;
  return semantic.every((candidate) => candidate.kind === first.kind
    && candidate.id === first.id
    && candidate.spaceId === first.spaceId
    && candidate.narrativeId === first.narrativeId)
    ? first
    : undefined;
}

export function childEntities(
  context: StudioTrackCompanionContext,
  items: readonly {
    /** Exact identity of the projected domain item consumed by Temporal/renderer bindings. */
    readonly id: string;
    /** Exact author-owned entity realized by this projected item, when the identities differ. */
    readonly subjectId?: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
    readonly stackOrder: number;
    /** Exact domain Spec types that may carry an omitted Source id. */
    readonly sourceTypes?: readonly TypeRef[];
  }[],
  entity: StudioTimelinePresentation["entity"],
  chrome: StudioTimelinePresentation["chrome"],
): readonly StudioEntityDraft[] {
  return items.map((item) => {
    const authoredId = item.subjectId ?? item.id;
    const child = authoredChildFor(context, authoredId, item.sourceTypes ?? []);
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
