import type { ScreenOverlayProgram } from "@hypit/screen-overlay";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioInspectorFieldDeclaration } from "@hypit/studio-adapter";
import { childEntities, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

function projectOverlays(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as ScreenOverlayProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.stacking.order,
  }));
  return childEntities(context, items, "screen-overlay", "standard").map((entity, index) => {
    const item = program.items[index];
    if (item === undefined) return entity;
    const temporal = temporalLineageFor(context, item.id, "window");
    return {
      ...entity,
      display: { title: item.content.kind.replaceAll("-", " "), layers: [] },
      ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
        ? {}
        : { markerId: temporal.source.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

const overlayOptions: Readonly<Record<string, readonly string[]>> = {
  direction: ["left", "right", "up", "down"],
  chroma: ["monochrome", "color"],
};

const overlayNames = [
  "color", "intensity", "opacity", "attack", "hold", "decay", "center-x", "center-y", "radius-x", "radius-y",
  "softness", "spacing", "thickness", "angle", "travel", "coverage", "feather", "from", "to", "direction",
  "width", "bars", "colors", "seed", "amount", "size", "chroma", "motion-rate", "min-size", "max-size",
  "warmth", "drift", "scan-lines", "z",
] as const;

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

const overlayGeometry = new Set(["center-x", "center-y", "radius-x", "radius-y", "width", "size", "min-size", "max-size", "z"]);
const overlayMotion = new Set(["attack", "hold", "decay", "travel", "from", "to", "motion-rate", "drift"]);
const overlayColor = new Set(["color", "colors"]);

const overlayInspector: readonly StudioInspectorFieldDeclaration[] = overlayNames.map((binding) => {
  const domain = overlayGeometry.has(binding) ? "where" as const : overlayMotion.has(binding) ? "when" as const : "how" as const;
  const page = overlayGeometry.has(binding) ? "Geometry" : overlayMotion.has(binding) ? "Motion" : overlayColor.has(binding) ? "Color" : "Effect";
  const options = overlayOptions[binding];
  const control = options !== undefined ? "select" as const
    : binding === "color" ? "color" : binding === "colors" ? "text" : "number";
  return {
    binding, label: title(binding), domain,
    page: { id: page.toLowerCase(), label: page }, section: { id: page.toLowerCase(), label: page },
    control,
    ...(options === undefined ? {} : { options }),
  };
});

export const screenOverlayStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/screen-overlay"] },
    family: "screen-overlay", tone: "orange", icon: "component",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    bindings: [
      { name: "start", writable: true }, { name: "end", writable: true }, { name: "for", writable: true },
      ...overlayNames.map((name) => ({ name, writable: true })),
    ],
    inspector: overlayInspector,
    requiredValues: ["program"], project: projectOverlays,
    poster: { source: "surface-preview" },
    lane: { heightPx: 52 },
  },
];
