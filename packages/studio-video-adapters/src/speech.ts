import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { readonlyInteraction } from "@hypit/studio-adapter";
import { projectTerminalAudio, projectTerminalVisual } from "./generic.js";
import { videoLaneHeights } from "./presentation.js";

function renameSpeechSegments(
  context: StudioAdapterContext,
  entities: readonly StudioEntityDraft[],
): readonly StudioEntityDraft[] {
  return entities.map((entity) => {
    const segment = context.semantic.segments.find((candidate) =>
      candidate.startFrame === entity.startFrame
      && candidate.endFrameExclusive === entity.endFrameExclusive,
    );
    if (segment === undefined) return entity;
    return { ...entity, authoredId: segment.id, label: segment.id };
  });
}

function projectSpeechVisual(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  return renameSpeechSegments(context, projectTerminalVisual(context));
}

function projectSpeechAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  return renameSpeechSegments(context, projectTerminalAudio(context));
}

export const speechAdapters: readonly StudioAdapter[] = [
  { id: "semantic-take", role: "semantic-take", output: { type: "SemanticTake" } },
  {
    id: "semantic-track", role: "semantic-track", output: { type: "SemanticTrack" },
    family: "speech", label: "Semantic", icon: "timeline",
    lane: { layout: "flat", height: videoLaneHeights.semantic },
  },
  {
    id: "speech-visual", role: "media",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/speech-track"] },
    family: "media", label: "Speech Visual", icon: "video",
    interaction: readonlyInteraction,
    project: projectSpeechVisual,
    lane: { layout: "flat", height: videoLaneHeights.picture },
  },
  {
    id: "speech-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/speech-track"] },
    family: "audio", label: "Speech Audio", icon: "waveform",
    interaction: readonlyInteraction,
    project: projectSpeechAudio,
    lane: { layout: "flat", height: videoLaneHeights.audio },
  },
];
