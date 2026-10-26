import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioItemDraft } from "@hypit/studio-companion";
import { artifactPreview, previewLayer, temporalLineageFor, temporalDomainMarker } from "@hypit/studio-companion";
import { audioTrackClips, compositionTypes } from "@hypit/composition";
import type { AudioTrack, VisualElement } from "@hypit/composition";

type TerminalVisualTrack = {
  readonly items?: readonly {
    readonly kind?: string;
    readonly id: string;
    readonly subjectId?: string;
    readonly root?: VisualElement;
  }[];
};

function withTemporalLineage(
  context: StudioTrackCompanionContext,
  item: StudioItemDraft,
): StudioItemDraft {
  const temporal = temporalLineageFor(context, item.authoredId);
  if (temporal === undefined) return item;
  const marker = temporalDomainMarker(temporal);
  return {
    ...item,
    ...(marker === undefined ? {} : { marker }),
    temporal,
  };
}

function projectTerminalVisual(context: StudioTrackCompanionContext): readonly StudioItemDraft[] {
  const visualItems = new Map(((context.track.value as TerminalVisualTrack).items ?? [])
    .map((item) => [item.id, item] as const));
  return context.generic().map((item, index) => {
    const terminal = visualItems.get(context.spans[index]?.id ?? "");
    if (terminal?.kind === "adjustment") {
      return withTemporalLineage(context, {
        ...item,
        ...(terminal.subjectId === undefined ? {} : { authoredId: terminal.subjectId }),
        display: { title: terminal.subjectId ?? terminal.id, layers: [] },
        presentation: { kind: "adjustment", chrome: "compact" },
      });
    }
    const present = terminal?.kind === "present" ? terminal : undefined;
    return withTemporalLineage(context, {
      ...item,
      ...(present?.subjectId === undefined ? {} : { authoredId: present.subjectId }),
      display: {
        title: present?.subjectId ?? item.display.title,
        layers: [],
      },
      presentation: { kind: "media-item", chrome: "standard" },
    });
  });
}

function projectTerminalAudio(context: StudioTrackCompanionContext): readonly StudioItemDraft[] {
  const clips = new Map(audioTrackClips(context.track.value as AudioTrack)
    .map((clip) => [clip.id, clip] as const));
  return context.generic().map((item, index) => {
    const clip = clips.get(context.spans[index]?.id ?? "");
    const resource = clip?.source.source.resource;
    return withTemporalLineage(context, {
      ...item,
      ...(clip?.subjectId === undefined ? {} : { authoredId: clip.subjectId }),
      display: {
        title: clip?.subjectId ?? item.display.title,
        layers: resource === undefined ? [] : [previewLayer(artifactPreview("audio", resource), "waveform")],
      },
      presentation: { kind: "audio-clip", chrome: "standard" },
    });
  });
}

/** Cross-domain terminal protocols understood even when no Companion is installed. */
export const fallbackStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "@hypit/studio#audio-track", role: "track", output: { type: compositionTypes.audioTrack },
    family: "audio", tone: "green", icon: "waveform",
    project: projectTerminalAudio,
    lane: { heightPx: 48 },
  },
  {
    id: "@hypit/studio#visual-track", role: "track", output: { type: compositionTypes.visualTrack },
    family: "visual", tone: "blue", icon: "video",
    project: projectTerminalVisual,
    lane: { heightPx: 76 },
  },
];
