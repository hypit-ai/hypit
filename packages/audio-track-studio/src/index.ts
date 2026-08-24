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
    parameters: [
      { name: "source", label: "Source", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "for", label: "For", writable: true },
      { name: "trim-start", label: "Trim source start", writable: true },
      { name: "trim-end", label: "Trim source end", writable: true },
      {
        name: "playback", label: "Playback", control: "select", writable: true,
        options: ["once", "once-start", "once-end", "loop", "loop-start", "loop-end", "stretch"],
      },
      { name: "min-rate", label: "Minimum rate", control: "number", writable: true },
      { name: "max-rate", label: "Maximum rate", control: "number", writable: true },
      { name: "gain", label: "Gain", control: "number", writable: true },
      { name: "fade-in", label: "Fade in", writable: true },
      { name: "fade-out", label: "Fade out", writable: true },
    ],
    requiredValues: ["program"], project: projectAudio,
    lane: { heightPx: 48 },
  },
];
