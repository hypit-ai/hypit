import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";

type SemanticTrackValue = {
  readonly items?: readonly {
    readonly take: { readonly segment: { readonly segmentId: string; readonly startFrame: number; readonly endFrameExclusive: number } };
  }[];
};

function projectSpeech(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const semantic = sameSurfaceValue(context, "semantic") as SemanticTrackValue | undefined;
  if (semantic?.items === undefined) return context.generic();
  let cursor = 0;
  const items = semantic.items.map(({ take }) => {
    const count = take.segment.endFrameExclusive - take.segment.startFrame;
    const item = { id: take.segment.segmentId, startFrame: cursor, endFrameExclusive: cursor + count, stackOrder: 0 };
    cursor += count;
    return item;
  });
  return childEntities(context, items, "semantic-take",
    context.track.type === "AudioTrack" ? "waveform" : "picture");
}

export const speechAdapters: readonly StudioAdapter[] = [
  { id: "semantic-take", role: "semantic-take", output: { type: "SemanticTake" } },
  { id: "semantic-track", role: "semantic-track", output: { type: "SemanticTrack" } },
  {
    id: "speech-visual", role: "speech-visual",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/speech-track"], siblingType: "SemanticTrack" },
    family: "speech", icon: "speech", interaction: readonlyInteraction,
    realizationPorts: ["semantic"], project: projectSpeech,
    lane: { layout: "flat", boundFacets: true },
  },
  {
    id: "speech-audio", role: "speech-audio",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/speech-track"], siblingType: "SemanticTrack" },
    family: "speech", icon: "waveform", interaction: readonlyInteraction,
    realizationPorts: ["semantic"], project: projectSpeech,
    lane: { layout: "flat", boundFacets: true },
  },
];
