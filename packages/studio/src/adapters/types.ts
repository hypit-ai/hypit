import type { Placement } from "../observe.js";
import type { BuiltTrack } from "../programme.js";
import type {
  Range,
  SemanticTimeline,
  StudioInteraction,
  StudioInspectorDescription,
  StudioLaneDescription,
  StudioMaterialPreview,
  StudioTimelinePresentation,
  StudioTemporalLineage,
  StudioTrackFamily,
} from "../shared.js";

export type StudioProjectionRole =
  | "semantic-take"
  | "semantic-track"
  | "caption-plan"
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
};

export type StudioAdapterContext = {
  readonly track: BuiltTrack;
  readonly placement?: Placement;
  /** Package-owned Surface preview resolved by Studio from the selected domain. */
  readonly surfacePreview?: StudioMaterialPreview;
  readonly spans: readonly StudioSpan[];
  readonly values: ReadonlyMap<string, unknown>;
  readonly semantic: SemanticTimeline;
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
  readonly project?: (context: StudioAdapterContext) => readonly StudioEntityDraft[];
};

export type StudioLaneAttachment = {
  readonly id: string;
  readonly family: StudioTrackFamily;
  readonly label?: string;
  readonly icon: string;
  readonly facet: "visual" | "audio";
  readonly lane: StudioLaneDescription;
  readonly interaction?: StudioInteraction;
  readonly inspector?: StudioInspectorDescription;
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

export const laneHeights = {
  // Speech is a compact two-row item: a short name bar and a full-height
  // semantic content row. The row itself, not outer padding, carries the
  // word timing blocks.
  semantic: { minPx: 44, preferredPx: 48, maxPx: 72 },
  picture: { minPx: 60, preferredPx: 76, maxPx: 128 },
  audio: { minPx: 40, preferredPx: 48, maxPx: 88 },
  text: { minPx: 42, preferredPx: 48, maxPx: 72 },
  component: { minPx: 44, preferredPx: 52, maxPx: 96 },
  fallback: { minPx: 44, preferredPx: 52, maxPx: 96 },
} as const;

export const flatLane: StudioLaneDescription = {
  layout: "flat",
  height: laneHeights.fallback,
};

export const standardInspector: StudioInspectorDescription = {
  sections: ["authoring", "resolved", "composition", "identity", "run"],
};

export function sameSurfaceValue(context: StudioAdapterContext, port: string): unknown {
  const ref = context.track.trace.outputPorts.find((candidate) => candidate.name === port)?.ref;
  return ref === undefined ? undefined : context.values.get(ref);
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
