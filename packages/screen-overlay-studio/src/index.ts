import type { ScreenOverlayProgram } from "@hypit/screen-overlay";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
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

export const screenOverlayStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/screen-overlay"] },
    family: "screen-overlay", tone: "orange", icon: "component",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    parameters: [
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "for", label: "For", writable: true },
      { name: "color", label: "Color", writable: true },
      { name: "intensity", label: "Intensity", control: "number", writable: true },
      { name: "opacity", label: "Opacity", control: "number", writable: true },
      { name: "attack", label: "Attack", control: "number", writable: true, unit: "f" },
      { name: "hold", label: "Hold", control: "number", writable: true, unit: "f" },
      { name: "decay", label: "Decay", control: "number", writable: true, unit: "f" },
      { name: "center-x", label: "Center X", control: "number", writable: true },
      { name: "center-y", label: "Center Y", control: "number", writable: true },
      { name: "radius-x", label: "Radius X", control: "number", writable: true },
      { name: "radius-y", label: "Radius Y", control: "number", writable: true },
      { name: "softness", label: "Softness", control: "number", writable: true },
      { name: "spacing", label: "Spacing", control: "number", writable: true },
      { name: "thickness", label: "Thickness", control: "number", writable: true },
      { name: "angle", label: "Angle", control: "number", writable: true },
      { name: "travel", label: "Travel", control: "number", writable: true },
      { name: "coverage", label: "Coverage", control: "number", writable: true },
      { name: "feather", label: "Feather", control: "number", writable: true },
      { name: "from", label: "From", control: "number", writable: true },
      { name: "to", label: "To", control: "number", writable: true },
      {
        name: "direction", label: "Direction", control: "select", writable: true,
        options: ["left", "right", "up", "down"],
      },
      { name: "width", label: "Width", control: "number", writable: true },
      { name: "bars", label: "Bars", control: "number", writable: true },
      { name: "colors", label: "Colors", writable: true },
      { name: "seed", label: "Seed", control: "number", writable: true },
      { name: "amount", label: "Amount", control: "number", writable: true },
      { name: "size", label: "Size", control: "number", writable: true },
      {
        name: "chroma", label: "Chroma", control: "select", writable: true,
        options: ["monochrome", "color"],
      },
      { name: "motion-rate", label: "Motion rate", control: "number", writable: true },
      { name: "min-size", label: "Minimum size", control: "number", writable: true },
      { name: "max-size", label: "Maximum size", control: "number", writable: true },
      { name: "warmth", label: "Warmth", control: "number", writable: true },
      { name: "drift", label: "Drift", control: "number", writable: true },
      { name: "scan-lines", label: "Scan lines", control: "number", writable: true },
      { name: "z", label: "Stack", control: "number", writable: true },
    ],
    requiredValues: ["program"], project: projectOverlays,
    poster: { source: "surface-preview" },
    lane: { heightPx: 52 },
  },
];
