import type { AudioTrackProgram } from "@hypit/audio-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { artifactPreview, childEntities, previewLayer, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor } from "@hypit/studio-adapter";

function projectAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as AudioTrackProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    startFrame: item.window.startFrame,
    endFrameExclusive: item.window.endFrameExclusive,
    stackOrder: Number.MIN_SAFE_INTEGER,
    preview: artifactPreview("audio", item.source.artifact.digest),
  }));
  return childEntities(context, items, "audio-clip", "standard").map((entity, index) => {
    const item = items[index]!;
    const temporal = temporalLineageFor(context, item.id, "window");
    return {
      ...entity,
      display: { ...entity.display, layers: [previewLayer(item.preview, "waveform")] },
      ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
        ? {}
        : { markerId: temporal.source.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const audioTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/audio-track"] },
    family: "audio", tone: "green", icon: "waveform",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    bindings: [
      { name: "source" },
      { name: "start", writable: true },
      { name: "end", writable: true },
      { name: "for", writable: true },
      { name: "trim-start", writable: true },
      { name: "trim-end", writable: true },
      { name: "playback", writable: true },
      { name: "min-rate", writable: true },
      { name: "max-rate", writable: true },
      { name: "gain", writable: true },
      { name: "fade-in", writable: true },
      { name: "fade-out", writable: true },
    ],
    inspector: [
      {
        binding: "playback", label: "Playback", domain: "how",
        page: { id: "playback", label: "Playback" }, section: { id: "playback", label: "Playback" },
        control: "select", options: ["once", "once-start", "once-end", "loop", "loop-start", "loop-end", "stretch"],
      },
      ...(["trim-start", "trim-end"] as const).map((binding) => ({
        binding, label: binding === "trim-start" ? "Trim Start" : "Trim End", domain: "how" as const,
        page: { id: "playback", label: "Playback" }, section: { id: "trim", label: "Trim" }, control: "text" as const,
      })),
      ...(["min-rate", "max-rate", "gain"] as const).map((binding) => ({
        binding, label: binding === "min-rate" ? "Minimum Rate" : binding === "max-rate" ? "Maximum Rate" : "Gain",
        domain: "how" as const, page: { id: "mix", label: "Mix" }, section: { id: "mix", label: "Mix" },
        control: "number" as const,
      })),
      ...(["fade-in", "fade-out"] as const).map((binding) => ({
        binding, label: binding === "fade-in" ? "Fade In" : "Fade Out", domain: "when" as const,
        page: { id: "fade", label: "Fade" }, section: { id: "fade", label: "Fade" }, control: "text" as const,
      })),
    ],
    requiredValues: ["program"], project: projectAudio,
    lane: { heightPx: 48 },
  },
];
