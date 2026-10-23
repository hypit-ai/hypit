import type { Facet } from "@hypit/hypit/facet";
import { sameType } from "@hypit/hypit/protocol";
import type { CanonicalValue, ModuleRef, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const studioCompanionFacetAbi = "hypit.studio-companion@1";

/** UTF-16 offsets into the exact author source. */
export type Range = { readonly start: number; readonly end: number };

export type StudioTrackFamily = string;
export type StudioIcon =
  | "brand"
  | "captions"
  | "component"
  | "chart"
  | "layers"
  | "text"
  | "timeline"
  | "video"
  | "waveform";
/** Studio-owned visual palette. Domain families never become CSS selectors. */
export type StudioTimelineTone =
  | "blue"
  | "blue-muted"
  | "green"
  | "green-muted"
  | "teal"
  | "violet"
  | "magenta"
  | "magenta-muted"
  | "orange"
  | "orange-muted"
  | "neutral";

export type StudioTimelinePresentation = {
  /** Package-owned item kind used only for presentation and diagnostics. */
  readonly kind: string;
  /** Studio-owned shell. Compact presents the primary label in one line, with time in details. */
  readonly chrome: "standard" | "group" | "point" | "compact";
};

type StudioTemporalSourceBase = {
  /** Domain-owned Type and role; Studio does not enumerate future time domains. */
  readonly type: TypeRef;
  readonly kind: string;
  readonly id: string;
};

export type StudioConstructionTemporalSource = StudioTemporalSourceBase & {
  readonly scope: "construction";
};

export type StudioTimelineTemporalSource = StudioTemporalSourceBase & {
  readonly scope: "timeline";
  readonly timelineId: string;
  /** Present only when a package Companion recognizes the domain-owned value. */
  readonly domain?: { readonly companion: string; readonly id: string };
};

export type StudioTemporalSource = StudioConstructionTemporalSource | StudioTimelineTemporalSource;

export type StudioTemporalAuthority =
  | {
      readonly kind: "domain";
      readonly source: StudioTimelineTemporalSource;
      readonly boundary: string;
    }
  | {
      readonly kind: "parameter";
      readonly binding: string;
      /** Exact executed Spec that owns this author parameter. */
      readonly owner?: string;
      readonly relation: "direct" | "after-start" | "before-end";
    }
  | { readonly kind: "fixed" };

export type StudioTemporalInstantProjection = {
  readonly kind: "instant";
  readonly expression: string;
  /** Domain-owned reference spelling, or one of Timeline's common expressions. */
  readonly reference: string;
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

export type StudioTemporalLineage = {
  /** Exact executed Temporal value. Studio keeps this identity for inverse traversal. */
  readonly record: string;
  readonly projection: StudioTemporalProjection;
};

/** Exact package-owned temporal Item that placed a Studio occurrence. */
export type StudioTemporalMarker = {
  readonly companion: string;
  readonly domainId: string;
  readonly itemId: string;
};

export type StudioSourceLocation = {
  readonly path: string;
  readonly range: Range;
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

/** Data-only choices. Packages supply meaning; Studio owns all option rendering. */
export type StudioParameterOption = string | {
  readonly value: string | number | boolean;
  readonly label: string;
  readonly description?: string;
  readonly preview?: { readonly kind: "color"; readonly color: string }
    | { readonly kind: "font"; readonly family: string; readonly sample?: string };
};

/** Displayed number = authored number × scale. Suffixes are retained, never converted. */
export type StudioNumberPresentation = {
  readonly scale?: number;
  readonly suffixes?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
};

/** Studio-only recursive control hints. They never refine a domain ValueSchema. */
export type StudioValuePresentation =
  | { readonly kind: "color" }
  | { readonly kind: "list"; readonly item?: StudioValuePresentation }
  | { readonly kind: "record"; readonly fields?: Readonly<Record<string, StudioValuePresentation>> };

/** Attribute ranges are relative to the owning element's source preimage. */
export type StudioAttributeGroupEdit = {
  readonly insertionOffset: number;
  readonly ranges: Readonly<Record<string, Range | null>>;
};

/** A real author endpoint. Its existence never implies Inspector visibility. */
export type StudioSourceBinding = {
  readonly id: string;
  /** Companion-owned path, stable across source files and projected Items. */
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
  readonly attributes?: StudioAttributeGroupEdit;
  readonly disabledReason?: string;
};

export type StudioInspectorDomain = "where" | "when" | "how";

export type StudioInspectorPageDeclaration = {
  readonly id: string;
  readonly label: string;
};

export type StudioInspectorSectionDeclaration = {
  readonly id: string;
  readonly label: string;
};

/** One visible field selected from a Companion's source bindings. */
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
  readonly options?: readonly StudioParameterOption[];
  readonly unit?: string;
  readonly number?: StudioNumberPresentation;
  readonly multiline?: boolean;
  /** Optional recursive presentation for this value and its structured members. */
  readonly valuePresentation?: StudioValuePresentation;
  /** Optional suggested colors, independent of the accepted color value. */
  readonly swatches?: readonly string[];
};

/** A selected Item's package-owned fact, with no author write endpoint. */
export type StudioInspectorValue = Pick<StudioInspectorFieldDeclaration,
  "label" | "domain" | "page" | "section" | "summary" | "unit"> & {
  readonly id: string;
  readonly value: CanonicalValue;
};

/** Display and edit authority are independent of the Where / When / How grouping. */
export type StudioInspectorField = Omit<StudioInspectorFieldDeclaration, "binding" | "control"> & {
  readonly binding?: string;
  readonly id: string;
  readonly control: StudioParameterControl;
  readonly value: CanonicalValue;
  readonly schema?: ValueSchema;
  readonly edit?: {
    readonly language: StudioParameterLanguage;
    readonly source: StudioSourceBinding["source"];
    readonly attributes?: StudioAttributeGroupEdit;
  };
};

/** Companion-owned source allowlist. It contains no editor presentation. */
export type StudioSourceBindingDeclaration = {
  readonly name: string;
  readonly writable?: boolean;
  readonly schema?: ValueSchema;
  /** Typed value used when this editable attribute is omitted. */
  readonly fallback?: CanonicalValue | ((authored: Readonly<Record<string, CanonicalValue>>) => CanonicalValue | undefined);
  /** Compose the referenced object's package-owned parameter Companion. */
  readonly companion?: boolean;
  /** Edit these scalar attributes together as one schema-described record. */
  readonly attributes?: readonly string[];
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
  readonly fallback?: CanonicalValue | ((authored: Readonly<Record<string, CanonicalValue>>) => CanonicalValue | undefined);
};

export type StudioTimelineGesture =
  | "move"
  | "trim-start"
  | "trim-end";

export type StudioEditCoordinate =
  | "program-frame"
  | "domain-anchor"
  | "source-frame"
  | "canvas-pixel"
  | "normalized-progress";

export type StudioSnapTarget = "frame" | "domain-anchor" | "item-edge";

export type StudioEditSourceRole = "start" | "end" | "duration" | "frame" | "x" | "y";

export type StudioEditSource = {
  readonly role: StudioEditSourceRole;
  readonly source: StudioSourceBinding["source"];
};

export type StudioTemporalDomainEditTarget =
  | {
      readonly kind: "span";
      readonly companion: string;
      readonly domainId: string;
      readonly itemId: string;
      readonly startAnchorId: string;
      readonly endAnchorId: string;
    }
  | {
      readonly kind: "point";
      readonly companion: string;
      readonly domainId: string;
      readonly itemId: string;
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
  /** How moving a domain Point changes the visible Item before recompilation. */
  readonly moveEffect?: "translate-window" | "move-start";
  /** Snap policy is data, not a timeline-wide guess. */
  readonly snapTo?: readonly StudioSnapTarget[];
  readonly sources?: readonly StudioEditSource[];
  /** Package-owned temporal-domain identity adjusted by this rectangle. */
  readonly domain?: StudioTemporalDomainEditTarget;
  /** Exact endpoint authority used to validate and execute this inverse. */
  readonly temporal?: StudioTemporalProjection;
  /** Exact executed Temporal value traversed by the server-side inverse planner. */
  readonly temporalRecord?: string;
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

export type StudioItemDisplay = {
  /** Primary label: a header in standard chrome, the complete single-line content in compact chrome. */
  readonly title: string;
  /** Ordered back-to-front body layers. */
  readonly layers: readonly StudioDisplayLayer[];
};

export type StudioLaneDescription = {
  /** Height of this single timeline lane; overlapping Items share it. */
  readonly heightPx: number;
  readonly groupId?: string;
  readonly attachedTo?: string;
  readonly order?: number;
};

export type StudioTemporalDomainAnchor = {
  readonly id: string;
  readonly frame: number;
  /** Domain-owned classification used only for display and stable coincident-point ordering. */
  readonly kind: string;
  readonly label?: string;
  readonly detail?: string;
  readonly range?: Range;
};

export type StudioTemporalDomainLane = {
  readonly id: string;
  readonly label?: string;
  readonly heightPx: number;
};

export type StudioTemporalDomainItem = {
  readonly id: string;
  readonly laneId: string;
  readonly label: string;
  readonly range?: Range;
  /** Matches the domain-owned value carried by Temporal lineage. */
  readonly source?: { readonly type: TypeRef; readonly kind: string; readonly id: string };
  /** Allows the package Companion to receive an inverse edit for this item. */
  readonly editable?: boolean;
  /** Let the code pane follow this item's source range while the playhead crosses it. */
  readonly followPlayhead?: boolean;
} & ({
  readonly kind: "span";
  readonly appearance: "block" | "compact";
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
} | {
  readonly kind: "point";
  readonly appearance: "marker";
  readonly anchorId: string;
  readonly frame: number;
});

export type StudioTemporalDomainView = {
  /** Exact projected-view identity supplied by its package, such as one Projection id. */
  readonly id: string;
  /** Qualified Companion identity; together with id this is globally unambiguous. */
  readonly companion: string;
  readonly timelineId: string;
  readonly presentation: {
    readonly family: StudioTrackFamily;
    readonly tone: StudioTimelineTone;
    readonly label?: string;
    readonly icon: StudioIcon;
  };
  readonly lanes: readonly StudioTemporalDomainLane[];
  readonly anchors: readonly StudioTemporalDomainAnchor[];
  /** Items visible on the shared Timeline. */
  readonly items: readonly StudioTemporalDomainItem[];
  /** Domain-owned inverse targets retained for Track/Item editing but not drawn as Timeline rows. */
  readonly editItems: readonly StudioTemporalDomainItem[];
  /** Exact package-owned author source used only for inverse dispatch. */
  readonly source: {
    readonly path: string;
    readonly content: Range;
  };
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
  /** Structured descendants preserved for recursive author vocabularies. */
  readonly children?: readonly StudioPlacementChild[];
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
  readonly role: StudioViewRole;
  readonly trace: StudioTrackTrace;
  readonly surfacePreview?: StudioMaterialPreview;
  readonly value: unknown;
};

export type StudioViewRole =
  | "supporting-value"
  | "track";

/**
 * Author-side correspondence with one terminal span. Studio resolves the span
 * to renderer-specific occurrences after package projection.
 */
export type StudioTerminalLink = {
  readonly spanId: string;
  /** Package-owned selection boundary inside a measurable visual Present. */
  readonly elementId?: string;
};

export type StudioSpan = {
  readonly id: string;
  /** Exact public terminal provenance; never inferred from id syntax. */
  readonly subjectId?: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly stackOrder: number;
};

export type StudioItemDraft = {
  readonly id: string;
  readonly authoredId: string;
  readonly display: StudioItemDisplay;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** Back-to-front timeline order. Ties preserve projection order. Selection raises only the timeline item. */
  readonly stackOrder: number;
  readonly elementLocation?: StudioSourceLocation;
  readonly marker?: StudioTemporalMarker;
  /** Terminal spans realizing this author Item. */
  readonly terminalLinks?: readonly StudioTerminalLink[];
  /** Resolved author references that differ per derived Item, such as one Cue's actual Style. */
  readonly parameterReferences?: Readonly<Record<string, string>>;
  /** Deliberately selected facts, presented beside bound Inspector fields. */
  readonly inspector?: readonly StudioInspectorValue[];
  readonly presentation?: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  /** Independent child Track partition; omitted means this Track. */
  readonly lane?: string;
};

/** One non-timeline author object owned by a Track and presented in Inspector. */
export type StudioInspectorObjectDraft = {
  readonly id: string;
  readonly authoredId: string;
  readonly title: string;
  readonly elementLocation?: StudioSourceLocation;
  readonly parameterReferences?: Readonly<Record<string, string>>;
  readonly inspector?: readonly StudioInspectorValue[];
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
  readonly temporalDomains: readonly StudioTemporalDomainView[];
  readonly generic: () => readonly StudioItemDraft[];
};

/** Package-owned projection of Track rules or other author objects that are not timeline occurrences. */
export type StudioInspectorObjectCompanion = {
  readonly id: string;
  readonly label: string;
  readonly bindings?: readonly StudioSourceBindingDeclaration[];
  readonly inspector?: readonly StudioInspectorFieldDeclaration[];
  readonly project: (context: StudioTrackCompanionContext) => readonly StudioInspectorObjectDraft[];
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
  /** Opts root timeline Items into the component's package-owned Surface preview. */
  readonly poster?: { readonly source: "surface-preview" };
  readonly attachments?: readonly StudioLaneAttachment[];
  /** Non-timeline author objects shown only in this Track's Inspector. */
  readonly inspectorObjects?: readonly StudioInspectorObjectCompanion[];
  /** Same-Surface output values required to project this Track for Studio. */
  readonly requiredValues?: readonly string[];
  readonly lane?: StudioLaneDescription;
  /** Exact author endpoints required by Inspector fields or timeline inverses. */
  readonly bindings?: readonly StudioSourceBindingDeclaration[];
  /** Visible field table. Undeclared bindings remain invisible. */
  readonly inspector?: readonly StudioInspectorFieldDeclaration[];
  readonly project?: (context: StudioTrackCompanionContext) => readonly StudioItemDraft[];
};

/** Parameters owned by an authored object, independently of its consumers. */
export type StudioParameterCompanion = {
  readonly id: string;
  readonly match: { readonly module: ModuleRef; readonly surface: string };
  readonly bindings: readonly StudioSourceBindingDeclaration[];
  readonly inspector: readonly StudioInspectorFieldDeclaration[];
};

export type StudioCompanionContribution = {
  readonly format: "hypit.studio-companions@1";
  readonly tracks: readonly StudioTrackCompanion[];
  readonly films?: readonly StudioFilmCompanion[];
  readonly temporalDomains?: readonly StudioTemporalDomainCompanion[];
  readonly temporalDeclarations?: readonly StudioTemporalDeclarationCompanion[];
  readonly temporalRelations?: readonly StudioTemporalRelationCompanion[];
  readonly parameters?: readonly StudioParameterCompanion[];
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
    /** Transparent authoring containers through which Track membership is followed. */
    readonly containerSurfaces?: readonly string[];
    readonly sourceAttribute: string;
    readonly types: readonly TypeRef[];
  };
};

export type StudioTemporalDomainSourceMap = {
  readonly companion: string;
  readonly domainId: string;
  readonly sourcePath: string;
  readonly range: Range;
  readonly content: Range;
  /** Opaque package-owned observation; common Studio never interprets its fields. */
  readonly data: unknown;
};

export type StudioTemporalDomainAdjustment =
  | { readonly kind: "span"; readonly itemId: string; readonly startAnchorId: string; readonly endAnchorId: string }
  | { readonly kind: "point"; readonly itemId: string; readonly anchorId: string };

export type StudioTemporalDomainProjection = Pick<StudioTemporalDomainView,
  "id" | "timelineId" | "lanes" | "anchors" | "items" | "editItems">;
export type StudioTemporalDomainProjectionInput = {
  readonly source: StudioTemporalDomainSourceMap;
  readonly values: readonly StudioObservedValue[];
  readonly timeline: {
    readonly id: string;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
  };
};

/** A package projects its own temporal facts and receives its own inverse edits. */
export type StudioTemporalDomainCompanion = {
  readonly id: string;
  readonly match: { readonly module: ModuleRef; readonly surface: string };
  /** Inline values required to build the domain view after execution. */
  readonly valueTypes: readonly TypeRef[];
  /** Domain reference Types that may appear in executed Temporal lineage. */
  readonly sourceTypes: readonly TypeRef[];
  readonly presentation: {
    readonly family: StudioTrackFamily;
    readonly tone: StudioTimelineTone;
    readonly label?: string;
    readonly icon: StudioIcon;
  };
  readonly identify: (input: { readonly type: TypeRef; readonly value: unknown }) => {
    readonly domainId: string;
    readonly kind: string;
    readonly id: string;
  } | undefined;
  readonly observe: (input: {
    readonly sourceName: string;
    /** Raw Surfaces receive Source text; structured Surfaces can rely on their decoded attributes/range. */
    readonly source?: string;
    readonly tag: string;
    /** Exact whole element range for raw and structured Surfaces alike. */
    readonly range: Range;
    /** Raw grammars may expose their body boundaries for package-owned parsing. */
    readonly contentStart?: number;
    /** Authoritative end returned by the raw Surface after it parsed its own grammar. */
    readonly nextOffset?: number;
    readonly attributes: Readonly<Record<string, unknown>>;
  }) => Omit<StudioTemporalDomainSourceMap, "companion"> | undefined;
  readonly project: (input: StudioTemporalDomainProjectionInput) => readonly StudioTemporalDomainProjection[];
  readonly adjust: (input: {
    readonly sourceName: string;
    readonly source: string;
    readonly adjustment: StudioTemporalDomainAdjustment;
  }) => string;
};

/** One package-owned author declaration whose primary result is an absolute Instant. */
export type StudioTemporalDeclarationDraft = {
  readonly id: string;
  readonly label?: string;
  /** Exact qualified logical output selected by the owning Surface Companion. */
  readonly output: string;
  readonly range?: Range;
};

/** Declares author-visible temporal outputs without choosing their common Studio presentation. */
export type StudioTemporalDeclarationCompanion = {
  readonly id: string;
  readonly match: { readonly module: ModuleRef; readonly surface: string };
  readonly project: (input: { readonly placement: StudioPlacement }) => readonly StudioTemporalDeclarationDraft[];
};

/** A desired value propagated while Studio reverses one executed temporal author graph. */
export type StudioTemporalConstraint =
  | { readonly kind: "instant"; readonly frame: number }
  | { readonly kind: "extent"; readonly frameCount: number }
  | { readonly kind: "span"; readonly startFrame: number; readonly endFrameExclusive: number };

export type StudioTemporalRelationValue = {
  readonly record: string;
  readonly type: TypeRef;
  readonly value: unknown;
};

export type StudioTemporalRelationInversePlan = {
  readonly constraints?: readonly { readonly input: string; readonly target: StudioTemporalConstraint }[];
  readonly writes?: readonly {
    readonly input: string;
    readonly binding: string;
    readonly replacement: string;
  }[];
};

export type StudioTemporalExtentTrace = {
  readonly kind: "extent";
  readonly frameCount: number;
  readonly authority?: Extract<StudioTemporalAuthority, { readonly kind: "parameter" }>;
};

export type StudioTemporalRelationTrace = StudioTemporalProjection | StudioTemporalExtentTrace;

/** Package-owned inverse semantics for one Producer relation. */
export type StudioTemporalRelationCompanion = {
  readonly id: string;
  readonly match: { readonly producer: ProducerRef; readonly output: string };
  readonly invert: (input: {
    readonly target: StudioTemporalConstraint;
    readonly output: StudioTemporalRelationValue;
    readonly inputs: Readonly<Record<string, StudioTemporalRelationValue>>;
    /** Constraint already imposed on a shared input by another output path. */
    readonly desired: (input: string) => StudioTemporalConstraint | undefined;
  }) => readonly StudioTemporalRelationInversePlan[];
  /** Reconstruct package-owned lineage without exposing its private Producer vocabulary to Studio. */
  readonly trace?: (input: {
    readonly output: StudioTemporalRelationValue;
    readonly inputs: Readonly<Record<string, StudioTemporalRelationValue>>;
    readonly trace: (input: string) => StudioTemporalRelationTrace | undefined;
    readonly identify: (input: string) => {
      readonly companion: string;
      readonly domainId: string;
      readonly kind: string;
      readonly itemId: string;
    } | undefined;
  }) => StudioTemporalRelationTrace | undefined;
};

export type StudioCompanionFacet = Facet & {
  readonly abi: typeof studioCompanionFacetAbi;
  readonly implementation: StudioCompanionContribution;
};

export function createStudioTrackCompanionFacet(tracks: readonly StudioTrackCompanion[]): StudioCompanionFacet {
  return {
    abi: studioCompanionFacetAbi,
    implementation: { format: "hypit.studio-companions@1", tracks },
  };
}

export function createStudioCompanionFacet(input: {
  readonly tracks?: readonly StudioTrackCompanion[];
  readonly films?: readonly StudioFilmCompanion[];
  readonly temporalDomains?: readonly StudioTemporalDomainCompanion[];
  readonly temporalDeclarations?: readonly StudioTemporalDeclarationCompanion[];
  readonly temporalRelations?: readonly StudioTemporalRelationCompanion[];
  readonly parameters?: readonly StudioParameterCompanion[];
}): StudioCompanionFacet {
  return {
    abi: studioCompanionFacetAbi,
    implementation: {
      format: "hypit.studio-companions@1",
      tracks: input.tracks ?? [],
      ...(input.films === undefined ? {} : { films: input.films }),
      ...(input.temporalDomains === undefined ? {} : { temporalDomains: input.temporalDomains }),
      ...(input.temporalDeclarations === undefined ? {} : { temporalDeclarations: input.temporalDeclarations }),
      ...(input.temporalRelations === undefined ? {} : { temporalRelations: input.temporalRelations }),
      ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    },
  };
}

export type StudioPackageContribution = {
  readonly tracks: readonly StudioTrackCompanion[];
  readonly films: readonly StudioFilmCompanion[];
  readonly temporalDomains: readonly StudioTemporalDomainCompanion[];
  readonly temporalDeclarations: readonly StudioTemporalDeclarationCompanion[];
  readonly temporalRelations: readonly StudioTemporalRelationCompanion[];
  readonly parameters: readonly StudioParameterCompanion[];
};

function qualify(owner: string, local: string, subject: string): string {
  if (local.length === 0 || local.includes("#")) {
    throw new Error(`${subject} ids are package-local names without '#': ${owner}#${local}`);
  }
  return `${owner}#${local}`;
}

export function studioContributionFromPackage(
  owner: string,
  facets: readonly Facet[],
): StudioPackageContribution {
  if (owner.length === 0 || owner.includes("#")) throw new Error(`Invalid Studio companion package identity: ${owner}`);
  const tracks: StudioTrackCompanion[] = [];
  const films: StudioFilmCompanion[] = [];
  const temporalDomains: StudioTemporalDomainCompanion[] = [];
  const temporalDeclarations: StudioTemporalDeclarationCompanion[] = [];
  const temporalRelations: StudioTemporalRelationCompanion[] = [];
  const parameters: StudioParameterCompanion[] = [];
  for (const facet of facets) {
    if (facet.abi !== studioCompanionFacetAbi) continue;
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
    parameters.push(...(contribution.parameters ?? []).map((parameter) => ({
      ...parameter, id: qualify(owner, parameter.id, "Studio Parameter companion"),
    })));
    temporalDomains.push(...(contribution.temporalDomains ?? []).map((domain) => ({
      ...domain,
      id: qualify(owner, domain.id, "Studio Temporal Domain companion"),
    })));
    temporalDeclarations.push(...(contribution.temporalDeclarations ?? []).map((declaration) => ({
      ...declaration,
      id: qualify(owner, declaration.id, "Studio Temporal Declaration companion"),
    })));
    temporalRelations.push(...(contribution.temporalRelations ?? []).map((relation) => ({
      ...relation,
      id: qualify(owner, relation.id, "Studio Temporal Relation companion"),
    })));
  }
  return { tracks, films, temporalDomains, temporalDeclarations, temporalRelations, parameters };
}

/**
 * Qualify package-local Companion names with identity established by the package loader.
 * The executable facet cannot choose or impersonate its physical owner.
 */
export function studioTrackCompanionsFromPackage(
  owner: string,
  facets: readonly Facet[],
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

/** Find the executed projection that explicitly names this domain Item as its subject. */
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
  return binding === undefined ? undefined : { record: binding.record, projection: binding.projection };
}

/** Unique domain-owned author identity carried by one projection, when there is one. */
export function temporalDomainSource(lineage: StudioTemporalLineage | undefined): StudioTimelineTemporalSource | undefined {
  if (lineage === undefined) return undefined;
  const projection = lineage.projection;
  const endpoints = projection.kind === "instant" ? [projection] : [projection.start, projection.end];
  const domain = endpoints.flatMap((endpoint) => endpoint.authority.kind === "domain"
    ? [endpoint.authority.source]
    : []);
  const first = domain[0];
  if (first === undefined) return undefined;
  return domain.every((candidate) => candidate.kind === first.kind
    && candidate.id === first.id
    && candidate.timelineId === first.timelineId
    && candidate.domain?.companion === first.domain?.companion
    && candidate.domain?.id === first.domain?.id)
    ? first
    : undefined;
}

export function temporalDomainMarker(lineage: StudioTemporalLineage | undefined): StudioTemporalMarker | undefined {
  const source = temporalDomainSource(lineage);
  return source?.domain === undefined ? undefined : {
    companion: source.domain.companion,
    domainId: source.domain.id,
    itemId: source.id,
  };
}

/** A package chooses which source references can name an otherwise unnamed Item. */
export function authoredItemTitle(
  context: StudioTrackCompanionContext,
  authoredId: string,
  sourceTypes: readonly TypeRef[],
  sourceAttributes: readonly string[],
): string {
  const child = authoredChildFor(context, authoredId, sourceTypes);
  if (child?.attributes.id) return child.attributes.id;
  for (const attribute of sourceAttributes) {
    const reference = child?.referenceAttributes[attribute];
    if (reference) return reference;
  }
  return authoredId;
}

export function childItems(
  context: StudioTrackCompanionContext,
  items: readonly {
    /** Exact identity of the projected domain item consumed by Temporal/renderer bindings. */
    readonly id: string;
    /** Exact author-owned Item realized by this projected item, when the identities differ. */
    readonly subjectId?: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
    readonly stackOrder: number;
    /** Exact domain Spec types that may carry an omitted Source id. */
    readonly sourceTypes?: readonly TypeRef[];
  }[],
  kind: StudioTimelinePresentation["kind"],
  chrome: StudioTimelinePresentation["chrome"],
): readonly StudioItemDraft[] {
  return items.map((item) => {
    const authoredId = item.subjectId ?? item.id;
    const child = authoredChildFor(context, authoredId, item.sourceTypes ?? []);
    // Both correspondences are exact public facts: the Program item identity
    // and the renderer's declared subject. No renderer naming convention is
    // interpreted here.
    const occurrences = context.spans.filter((span) => span.id === item.id || span.subjectId === authoredId);
    return {
      id: `item:${item.id}`,
      authoredId,
      display: { title: authoredId, layers: [] },
      startFrame: item.startFrame,
      endFrameExclusive: item.endFrameExclusive,
      stackOrder: item.stackOrder,
      ...(child === undefined ? {} : { elementLocation: { path: child.sourcePath, range: child.range } }),
      terminalLinks: occurrences.map((span) => ({ spanId: span.id })),
      presentation: { kind, chrome },
    };
  });
}
