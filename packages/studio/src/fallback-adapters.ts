import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { artifactPreview, previewLayer, temporalLineageFor } from "@hypit/studio-adapter";

type TerminalVisualTrack = {
  readonly presents?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly elements?: readonly {
      readonly kind?: string;
      readonly artifact?: { readonly digest?: string };
    }[];
  }[];
};

type TerminalAudioTrack = {
  readonly clips?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly artifact?: { readonly digest?: string };
  }[];
};

function withTemporalLineage(
  context: StudioAdapterContext,
  entity: StudioEntityDraft,
): StudioEntityDraft {
  const identities = [
    entity.authoredId,
    entity.markerId,
    entity.presentId,
    ...(entity.renderIds ?? []),
  ].filter((value): value is string => value !== undefined);
  const temporal = identities.map((identity) => temporalLineageFor(context, identity))
    .find((candidate) => candidate !== undefined);
  if (temporal === undefined) return entity;
  return {
    ...entity,
    ...(temporal.source.kind === "program" || temporal.source.id === undefined
      ? {}
      : { markerId: temporal.source.id }),
    temporal,
  };
}

function projectTerminalVisual(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const presents = new Map(((context.track.value as TerminalVisualTrack).presents ?? [])
    .map((present) => [present.id, present] as const));
  return context.generic().map((entity) => {
    const present = entity.presentId === undefined ? undefined : presents.get(entity.presentId);
    const material = present?.elements?.find((element) =>
      (element.kind === "image" || element.kind === "video") && element.artifact?.digest !== undefined);
    const digest = material?.artifact?.digest;
    return withTemporalLineage(context, {
      ...entity,
      ...(present?.subjectId === undefined ? {} : { authoredId: present.subjectId }),
      display: {
        title: present?.subjectId ?? entity.display.title,
        layers: digest === undefined ? [] : [previewLayer(artifactPreview(material?.kind === "image" ? "image" : "video", digest), material?.kind === "image" ? "repeat-x" : "storyboard")],
      },
      presentation: { entity: "media-item", chrome: "standard" },
    });
  });
}

function projectTerminalAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const clips = new Map(((context.track.value as TerminalAudioTrack).clips ?? [])
    .map((clip) => [clip.id, clip] as const));
  return context.generic().map((entity, index) => {
    const clip = clips.get(context.spans[index]?.id ?? "");
    const digest = clip?.artifact?.digest;
    return withTemporalLineage(context, {
      ...entity,
      ...(clip?.subjectId === undefined ? {} : { authoredId: clip.subjectId }),
      display: {
        title: clip?.subjectId ?? entity.display.title,
        layers: digest === undefined ? [] : [previewLayer(artifactPreview("audio", digest), "waveform")],
      },
      presentation: { entity: "audio-clip", chrome: "standard" },
    });
  });
}

/** Cross-domain terminal protocols understood even when no Companion is installed. */
export const fallbackStudioAdapters: readonly StudioAdapter[] = [
  { id: "@hypit/studio#semantic-take", role: "semantic-take", output: { type: "SemanticTake" } },
  {
    id: "@hypit/studio#semantic-track", role: "semantic-track", output: { type: "SemanticTrack" },
    family: "semantic", tone: "teal", label: "Semantic", icon: "brand",
    lane: { heightPx: 45 },
  },
  {
    id: "@hypit/studio#audio-track", role: "track", output: { type: "AudioTrack" },
    family: "audio", tone: "green", icon: "waveform",
    project: projectTerminalAudio,
    lane: { heightPx: 48 },
  },
  {
    id: "@hypit/studio#visual-track", role: "track", output: { type: "VisualTrack" },
    family: "media", tone: "blue", icon: "video",
    project: projectTerminalVisual,
    lane: { heightPx: 76 },
  },
];
