import { speechTrackModuleRef } from "@hypit/speech-track";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { artifactPreview, previewLayer } from "@hypit/studio-adapter";
type SpeechAudioTrack = {
  readonly clips?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly artifact?: { readonly resource?: string };
  }[];
};

function projectSpeechAudio(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const clips = new Map(((context.track.value as SpeechAudioTrack).clips ?? [])
    .map((clip) => [clip.id, clip] as const));
  return context.generic().map((entity) => {
    const id = entity.presentId ?? entity.authoredId;
    const clip = clips.get(id);
    const subjectId = clip?.subjectId;
    return {
      ...entity,
      authoredId: subjectId ?? id,
      display: {
        title: subjectId ?? entity.authoredId,
        layers: clip?.artifact?.resource === undefined ? [] : [previewLayer(artifactPreview("audio", clip.artifact.resource), "waveform")],
      },
      presentation: { entity: "audio-clip", chrome: "standard" },
    };
  });
}

export const speechTrackStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "audio", role: "track",
    output: { type: compositionTypes.audioTrack, surface: "track", modules: [speechTrackModuleRef] },
    family: "speech-audio", tone: "green", label: "Speech Audio", icon: "waveform",
    bindings: [], inspector: [], project: projectSpeechAudio,
    lane: { heightPx: 48 },
  },
];
