import type { Placement } from "../observe.js";
import type { BuiltTrack } from "../programme.js";
import type {
  Range,
  StudioInteraction,
  StudioInspectorDescription,
  StudioLaneDescription,
  StudioTimelinePresentation,
  StudioTrackFamily,
} from "../shared.js";

export type StudioProjectionRole =
  | "semantic-take"
  | "semantic-track"
  | "caption-plan"
  | "realization"
  | "speech-visual"
  | "speech-audio"
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
};

export type StudioAdapterContext = {
  readonly track: BuiltTrack;
  readonly placement?: Placement;
  readonly spans: readonly StudioSpan[];
  readonly values: ReadonlyMap<string, unknown>;
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
  readonly icon?: string;
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

export const readonlyInteraction: StudioInteraction = {
  select: true,
  seek: "pointer",
  move: false,
  trimStart: false,
  trimEnd: false,
  canvasTransform: false,
  writeback: "none",
};

export const flatLane: StudioLaneDescription = { layout: "flat", boundFacets: false };

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
    const child = children.get(item.id);
    // A dedicated adapter does not reverse-engineer renderer ids. Only an exact
    // public identity is safe; richer renderer correspondence needs its own
    // declared realization rather than another naming convention.
    const render = context.spans.find((span) => span.id === item.id);
    return {
      id: `${context.track.outputRef}:entity:${item.id}`,
      authoredId: item.id,
      label: item.id,
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
